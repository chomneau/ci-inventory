import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm'
import type { AuditEntry, auditListQuery } from '@shared/admin'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { auditLog, users } from '../db/schema'
import { toCsv } from './csv'

function escapeLike(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

function parseDetails(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Read-side of the audit log: listing, a user's own sign-in activity, and CSV export. */
export function listAudit(db: Db, query: Partial<z.output<typeof auditListQuery>> = {}): AuditEntry[] {
  const conditions: SQL[] = []
  if (query.actorUserId) conditions.push(eq(auditLog.actorUserId, query.actorUserId))
  if (query.search) {
    const p = escapeLike(query.search)
    conditions.push(
      or(
        sql`${auditLog.action} like ${p} escape '\\'`,
        sql`${auditLog.details} like ${p} escape '\\'`,
        sql`${users.displayName} like ${p} escape '\\'`
      )!
    )
  }
  return db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      actorUserId: auditLog.actorUserId,
      actorName: users.displayName,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      details: auditLog.details
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(query.limit ?? 200)
    .offset(query.offset ?? 0)
    .all()
    .map((r) => ({ ...r, at: r.at.getTime(), details: parseDetails(r.details) }))
}

/** The signed-in user's own recent sign-in related events (for "Recent activity"). */
export function recentSignInActivity(db: Db, userId: number, limit = 15): AuditEntry[] {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.actorUserId, userId), like(auditLog.action, 'auth.%')))
    .orderBy(desc(auditLog.id))
    .limit(limit)
    .all()
    .map((r) => ({
      id: r.id,
      at: r.at.getTime(),
      actorUserId: r.actorUserId,
      actorName: null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: parseDetails(r.details)
    }))
}

export function auditCsv(db: Db): string {
  const header = ['#', 'Time (UTC)', 'User', 'Action', 'Entity', 'Entity ID', 'Details', 'Hash']
  const rows = db
    .select({ e: auditLog, actorName: users.displayName })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .orderBy(auditLog.id)
    .all()
    .map(({ e, actorName }) => [e.id, e.at.toISOString(), actorName ?? 'system', e.action, e.entityType, e.entityId, e.details, e.hash])
  return toCsv([header, ...rows])
}
