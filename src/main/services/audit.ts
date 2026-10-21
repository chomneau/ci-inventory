import { createHash } from 'node:crypto'
import { asc, desc, gt, sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { canonicalJson } from '../db/canonical-json'
import { auditLog } from '../db/schema'
import type * as schema from '../db/schema'

/** Either the database or a transaction handle, so audit rows commit with the change they describe. */
export type DbOrTx = BaseSQLiteDatabase<'sync', unknown, typeof schema>

export const GENESIS_HASH = '0'.repeat(64)

export interface AuditEntry {
  actorUserId: number | null
  action: string
  entityType?: string
  entityId?: string | number
  details?: Record<string, unknown>
}

interface HashedFields {
  id: number
  at: number
  actorUserId: number | null
  action: string
  entityType: string | null
  entityId: string | null
  details: string
}

export function computeAuditHash(prevHash: string, row: HashedFields): string {
  return createHash('sha256').update(prevHash).update('\n').update(canonicalJson(row)).digest('hex')
}

/**
 * Appends one entry to the hash chain. Call it inside the same transaction as
 * the change being audited, so both commit or neither does.
 */
export function recordAudit(db: DbOrTx, entry: AuditEntry, now: Date = new Date()): void {
  const last = db.select({ id: auditLog.id, hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.id)).limit(1).get()
  const fields: HashedFields = {
    id: (last?.id ?? 0) + 1,
    at: now.getTime(),
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    details: canonicalJson(entry.details ?? {})
  }
  const prevHash = last?.hash ?? GENESIS_HASH
  db.insert(auditLog)
    .values({ ...fields, at: now, prevHash, hash: computeAuditHash(prevHash, fields) })
    .run()
}

export type AuditVerification =
  | { ok: true; entries: number }
  | { ok: false; entries: number; brokenAtId: number; reason: 'gap' | 'prev_hash' | 'hash' | 'truncated' }

/**
 * Re-computes the whole chain. Detects edited rows (hash), removed or
 * re-ordered rows (gap / prev_hash) and removed rows at the end (truncated).
 */
export function verifyAuditChain(db: DbOrTx, pageSize = 1000): AuditVerification {
  let prevHash = GENESIS_HASH
  let expectedId = 1
  let lastId = 0

  for (;;) {
    const page = db.select().from(auditLog).where(gt(auditLog.id, lastId)).orderBy(asc(auditLog.id)).limit(pageSize).all()
    for (const row of page) {
      const fail = (reason: 'gap' | 'prev_hash' | 'hash') =>
        ({ ok: false, entries: expectedId - 1, brokenAtId: row.id, reason }) as const
      if (row.id !== expectedId) return fail('gap')
      if (row.prevHash !== prevHash) return fail('prev_hash')
      const recomputed = computeAuditHash(prevHash, {
        id: row.id,
        at: row.at.getTime(),
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        details: row.details
      })
      if (recomputed !== row.hash) return fail('hash')
      prevHash = row.hash
      lastId = row.id
      expectedId++
    }
    if (page.length < pageSize) break
  }

  // AUTOINCREMENT remembers the highest id ever used; a lower last row means rows were cut off the end.
  const seq = db.get<{ seq: number } | undefined>(sql`SELECT seq FROM sqlite_sequence WHERE name = 'audit_log'`)
  if ((seq?.seq ?? 0) > lastId) {
    return { ok: false, entries: lastId, brokenAtId: lastId + 1, reason: 'truncated' }
  }
  return { ok: true, entries: lastId }
}
