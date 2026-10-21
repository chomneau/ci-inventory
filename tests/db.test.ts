import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { items, locations, stockMovements, users } from '../src/main/db/schema'
import { MIGRATIONS, openTestDatabase, randomKey } from './helpers'

describe('encrypted database', () => {
  let t: ReturnType<typeof openTestDatabase>
  beforeEach(() => {
    t = openTestDatabase()
  })
  afterEach(() => t.cleanup())

  it('applies migrations', () => {
    const tables = t.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .pluck()
      .all()
    expect(tables).toEqual(
      expect.arrayContaining(['audit_log', 'categories', 'items', 'locations', 'recovery_codes', 'settings', 'stock_movements', 'user_totp', 'users'])
    )
    expect(t.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(t.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
  })

  it('stores nothing in plaintext and cannot be opened with another key', () => {
    t.db.insert(users).values({ email: 'secret-person@ci.org', displayName: 'X', passwordHash: 'h', role: 'admin' }).run()
    t.sqlite.pragma('wal_checkpoint(TRUNCATE)')
    const bytes = readFileSync(t.file)
    expect(bytes.includes('secret-person')).toBe(false)
    expect(bytes.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3')

    expect(() => openDatabase(t.file, randomKey(), MIGRATIONS)).toThrow(/not a database/)
  })

  it('rejects malformed keys before they reach the PRAGMA', () => {
    expect(() => openDatabase(t.file, `abc'; DROP TABLE users; --`, MIGRATIONS)).toThrow(/Invalid database key/)
  })

  describe('stock ledger', () => {
    const seed = () => {
      const u = t.db.insert(users).values({ email: 'a@ci.org', displayName: 'A', passwordHash: 'h', role: 'storekeeper' }).returning().get()
      const loc = t.db.insert(locations).values({ name: 'Main store' }).returning().get()
      const item = t.db.insert(items).values({ sku: 'PEN-001', nameEn: 'Pen' }).returning().get()
      return { userId: u.id, locationId: loc.id, itemId: item.id }
    }

    it('enforces the sign of each movement type', () => {
      const s = seed()
      const add = (type: 'in' | 'out' | 'adjust', quantity: number) =>
        t.db.insert(stockMovements).values({ itemId: s.itemId, locationId: s.locationId, createdBy: s.userId, type, quantity }).run()
      expect(() => add('in', 10)).not.toThrow()
      expect(() => add('out', -3)).not.toThrow()
      expect(() => add('in', -5)).toThrow(/CHECK constraint/)
      expect(() => add('out', 2)).toThrow(/CHECK constraint/)
      expect(() => add('adjust', 0)).toThrow(/CHECK constraint/)
    })

    it('is append-only', () => {
      const s = seed()
      t.db.insert(stockMovements).values({ itemId: s.itemId, locationId: s.locationId, createdBy: s.userId, type: 'in', quantity: 5 }).run()
      expect(() => t.sqlite.exec('UPDATE stock_movements SET quantity = 500')).toThrow(/append-only/)
      expect(() => t.sqlite.exec('DELETE FROM stock_movements')).toThrow(/append-only/)
    })

    it('blocks deleting an item that has movements', () => {
      const s = seed()
      t.db.insert(stockMovements).values({ itemId: s.itemId, locationId: s.locationId, createdBy: s.userId, type: 'in', quantity: 5 }).run()
      expect(() => t.sqlite.exec('DELETE FROM items')).toThrow(/FOREIGN KEY/)
    })
  })
})
