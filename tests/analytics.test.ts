import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PublicUser } from '@shared/auth'
import { itemCreate } from '@shared/inventory'
import { stockMovements, users } from '../src/main/db/schema'
import { dayKey, inventoryAnalytics } from '../src/main/services/analytics'
import { InventoryService } from '../src/main/services/inventory'
import { openTestDatabase } from './helpers'

const DAY = 86_400_000
const NOW = new Date(2026, 9, 21, 15, 0, 0) // 21 Oct 2026, 15:00 local

describe('inventoryAnalytics', () => {
  let t: ReturnType<typeof openTestDatabase>
  let inv: InventoryService
  let actor: PublicUser
  let store: number
  let office: number
  let pen: number
  let paper: number

  /** Inserts a ledger row at a given number of days before NOW. */
  const at = (daysAgo: number, row: { itemId: number; locationId: number; type: 'in' | 'out' | 'adjust' | 'transfer_in' | 'transfer_out'; quantity: number; issuedTo?: string; unitCostCents?: number }) =>
    t.db.insert(stockMovements).values({ ...row, createdBy: actor.id, createdAt: new Date(NOW.getTime() - daysAgo * DAY) }).run()

  beforeEach(() => {
    t = openTestDatabase()
    const u = t.db.insert(users).values({ email: 'a@ci.org', displayName: 'A', passwordHash: 'x', role: 'admin' }).returning().get()
    actor = { id: u.id, email: u.email, displayName: u.displayName, role: u.role }
    inv = new InventoryService(t.db)
    store = inv.createLocation(actor, { name: 'Store' }).id
    office = inv.createLocation(actor, { name: 'Office' }).id
    const stationery = inv.createCategory(actor, { nameEn: 'Stationery', nameKm: 'សម្ភារៈការិយាល័យ' }).id
    pen = inv.createItem(actor, itemCreate.parse({ sku: 'PEN', nameEn: 'Pen', unit: 'pcs', minStock: 10, unitCostCents: 50, categoryId: stationery })).id
    paper = inv.createItem(actor, itemCreate.parse({ sku: 'PAPER', nameEn: 'Paper', unit: 'ream', minStock: 2, unitCostCents: 400 })).id

    at(40, { itemId: pen, locationId: store, type: 'in', quantity: 100 }) // before both periods
    at(10, { itemId: pen, locationId: store, type: 'out', quantity: -30, issuedTo: 'Finance' }) // previous period (7d view)
    at(3, { itemId: paper, locationId: store, type: 'in', quantity: 5, unitCostCents: 380 })
    at(2, { itemId: pen, locationId: store, type: 'out', quantity: -60, issuedTo: 'finance ' })
    at(1, { itemId: paper, locationId: store, type: 'out', quantity: -4, issuedTo: 'Programs' })
    at(0, { itemId: pen, locationId: store, type: 'transfer_out', quantity: -5 })
    at(0, { itemId: pen, locationId: office, type: 'transfer_in', quantity: 5 })
  })
  afterEach(() => t.cleanup())

  it('buckets the period by local day and compares with the previous one', () => {
    const a = inventoryAnalytics(t.db, { days: 7 }, NOW)
    expect(a.series).toHaveLength(7)
    expect(a.series.at(-1)!.day).toBe(dayKey(NOW))
    // received: 5 × $3.80 (receipt cost) · issued: 60 × $0.50 + 4 × $4.00
    expect(a.current).toEqual({ receivedCents: 1900, issuedCents: 3000 + 1600, movements: 4 })
    expect(a.previous).toEqual({ receivedCents: 0, issuedCents: 1500, movements: 1 })
    expect(a.series.find((d) => d.day === dayKey(new Date(NOW.getTime() - 2 * DAY)))?.issuedCents).toBe(3000)
  })

  it('reports stock value now and at the end of each day', () => {
    const a = inventoryAnalytics(t.db, { days: 7 }, NOW)
    // pens: 100 - 30 - 60 = 10 × 50 = 500 · paper: 5 - 4 = 1 × 400 = 400
    expect(a.stockValueCents).toBe(900)
    expect(a.series.at(-1)!.stockValueCents).toBe(900)
    // three days ago (before the paper receipt and the 60-pen issue) only 70 pens were held
    expect(a.series.find((d) => d.day === dayKey(new Date(NOW.getTime() - 4 * DAY)))?.stockValueCents).toBe(70 * 50)
  })

  it('classifies stock health and suggests reorders', () => {
    const a = inventoryAnalytics(t.db, { days: 30 }, NOW)
    // pen 10 ≤ min 10 → low; paper 1 ≤ min 2 → low
    expect(a.health).toEqual({ ok: 0, low: 2, out: 0 })
    expect(a.reorder.map((r) => [r.sku, r.suggestedQuantity, r.estimatedCostCents])).toEqual([
      ['PAPER', 3, 1200], // 1/2 is lower than 10/10, so it comes first
      ['PEN', 10, 500]
    ])
  })

  it('ranks consumption by item and by recipient (case-insensitive)', () => {
    const a = inventoryAnalytics(t.db, { days: 30 }, NOW)
    expect(a.topIssued.map((i) => [i.sku, i.quantity, i.valueCents])).toEqual([
      ['PEN', 90, 4500],
      ['PAPER', 4, 1600]
    ])
    expect(a.issuedTo.map((r) => [r.recipient, r.valueCents, r.movements])).toEqual([
      ['Finance', 4500, 2],
      ['Programs', 1600, 1]
    ])
    expect(a.valueByCategory.map((c) => [c.nameEn, c.valueCents])).toEqual([
      ['Stationery', 500],
      ['', 400]
    ])
  })

  it('scopes everything to one location', () => {
    const a = inventoryAnalytics(t.db, { days: 7, locationId: office }, NOW)
    expect(a.stockValueCents).toBe(5 * 50) // only the 5 transferred pens
    expect(a.current).toEqual({ receivedCents: 0, issuedCents: 0, movements: 1 }) // the transfer arriving here
    expect(a.health).toEqual({ ok: 0, low: 1, out: 0 })
  })
})
