import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalJson } from '../src/main/db/canonical-json'
import { recordAudit, verifyAuditChain } from '../src/main/services/audit'
import { openTestDatabase } from './helpers'

describe('canonicalJson', () => {
  it('is independent of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }))
  })
  it('rejects values that cannot round-trip', () => {
    expect(() => canonicalJson({ n: NaN })).toThrow()
    expect(() => canonicalJson({ f: () => 1 })).toThrow()
  })
})

describe('audit hash chain', () => {
  let t: ReturnType<typeof openTestDatabase>

  beforeEach(() => {
    t = openTestDatabase()
    recordAudit(t.db, { actorUserId: null, action: 'database.created' })
    recordAudit(t.db, { actorUserId: 1, action: 'item.create', entityType: 'item', entityId: 7, details: { sku: 'PEN-001' } })
    recordAudit(t.db, { actorUserId: 1, action: 'stock.in', entityType: 'item', entityId: 7, details: { qty: 10 } })
  })
  afterEach(() => t.cleanup())

  /** Simulates an attacker with direct DB access who removes the append-only guard. */
  const dropGuards = () => t.sqlite.exec('DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_log_no_delete;')

  it('verifies an untouched chain', () => {
    expect(verifyAuditChain(t.db)).toEqual({ ok: true, entries: 3 })
  })

  it('verifies across page boundaries', () => {
    expect(verifyAuditChain(t.db, 2)).toEqual({ ok: true, entries: 3 })
  })

  it('blocks edits and deletes through the triggers', () => {
    expect(() => t.sqlite.exec(`UPDATE audit_log SET action = 'x' WHERE id = 2`)).toThrow(/append-only/)
    expect(() => t.sqlite.exec('DELETE FROM audit_log WHERE id = 2')).toThrow(/append-only/)
  })

  it('detects an edited row', () => {
    dropGuards()
    t.sqlite.exec(`UPDATE audit_log SET details = '{"qty":1000}' WHERE id = 3`)
    expect(verifyAuditChain(t.db)).toMatchObject({ ok: false, brokenAtId: 3, reason: 'hash' })
  })

  it('detects a row removed from the middle', () => {
    dropGuards()
    t.sqlite.exec('DELETE FROM audit_log WHERE id = 2')
    expect(verifyAuditChain(t.db)).toMatchObject({ ok: false, brokenAtId: 3, reason: 'gap' })
  })

  it('detects rows cut off the end', () => {
    dropGuards()
    t.sqlite.exec('DELETE FROM audit_log WHERE id = 3')
    expect(verifyAuditChain(t.db)).toMatchObject({ ok: false, reason: 'truncated' })
  })

  it('commits audit rows atomically with the transaction', () => {
    expect(() =>
      t.db.transaction((tx) => {
        recordAudit(tx, { actorUserId: 1, action: 'will.rollback' })
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(verifyAuditChain(t.db)).toEqual({ ok: true, entries: 3 })
  })
})
