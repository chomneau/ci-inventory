import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PublicUser } from '@shared/auth'
import { itemCreate, stockMovementInput } from '@shared/inventory'
import { users } from '../src/main/db/schema'
import { verifyAuditChain } from '../src/main/services/audit'
import { toCsv } from '../src/main/services/csv'
import { InventoryService } from '../src/main/services/inventory'
import { openTestDatabase } from './helpers'

describe('InventoryService', () => {
  let t: ReturnType<typeof openTestDatabase>
  let inv: InventoryService
  let actor: PublicUser
  let store: number
  let office: number

  const newItem = (over: Record<string, unknown> = {}) =>
    inv.createItem(actor, itemCreate.parse({ sku: 'pen-blue', nameEn: 'Blue pen', unit: 'pcs', minStock: 5, unitCostCents: 25, defaultLocationId: store, ...over }))
  const move = (input: Record<string, unknown>) => inv.recordMovement(actor, stockMovementInput.parse(input))
  const code = (fn: () => unknown) => {
    try {
      fn()
    } catch (e) {
      return (e as { code?: string }).code
    }
    return 'NO_ERROR'
  }

  beforeEach(() => {
    t = openTestDatabase()
    const u = t.db.insert(users).values({ email: 'k@ci.org', displayName: 'Keeper', passwordHash: 'x', role: 'storekeeper' }).returning().get()
    actor = { id: u.id, email: u.email, displayName: u.displayName, role: u.role }
    inv = new InventoryService(t.db)
    store = inv.createLocation(actor, { name: 'Main store' }).id
    office = inv.createLocation(actor, { name: 'Office 2F' }).id
  })
  afterEach(() => t.cleanup())

  it('normalises SKU and records opening stock as a ledger entry', () => {
    const item = newItem({ openingQuantity: 20 })
    expect(item.sku).toBe('PEN-BLUE')
    expect(item.onHand).toBe(20)
    expect(item.stockByLocation).toEqual([{ locationId: store, locationName: 'Main store', quantity: 20 }])
    expect(inv.listMovements({ itemId: item.id })[0]).toMatchObject({ type: 'in', quantity: 20, reason: 'Opening stock' })
  })

  it('rejects duplicate SKUs and opening stock without a location', () => {
    newItem()
    expect(code(() => newItem())).toBe('DUPLICATE')
    expect(code(() => newItem({ sku: 'X1', defaultLocationId: null, openingQuantity: 3 }))).toBe('LOCATION_REQUIRED')
  })

  it('handles in / out / adjust / transfer and never goes negative', () => {
    const { id } = newItem()
    move({ type: 'in', itemId: id, locationId: store, quantity: 10 })
    expect(code(() => move({ type: 'out', itemId: id, locationId: store, quantity: 11 }))).toBe('INSUFFICIENT_STOCK')
    move({ type: 'out', itemId: id, locationId: store, quantity: 3, issuedTo: 'Finance' })
    move({ type: 'transfer', itemId: id, fromLocationId: store, toLocationId: office, quantity: 4 })
    expect(code(() => move({ type: 'transfer', itemId: id, fromLocationId: office, toLocationId: office, quantity: 1 }))).toBe('SAME_LOCATION')
    move({ type: 'adjust', itemId: id, locationId: office, countedQuantity: 2, reason: 'Stock count' })
    expect(code(() => move({ type: 'adjust', itemId: id, locationId: office, countedQuantity: 2, reason: 'again' }))).toBe('NO_CHANGE')

    const item = inv.getItem(id)
    expect(item.onHand).toBe(5) // 10 - 3 - 4 + 4 - 2
    expect(item.stockByLocation.map((s) => [s.locationName, s.quantity])).toEqual([
      ['Main store', 3],
      ['Office 2F', 2]
    ])
    expect(inv.listMovements({ itemId: id }).map((m) => [m.type, m.quantity])).toEqual([
      ['adjust', -2],
      ['transfer_in', 4],
      ['transfer_out', -4],
      ['out', -3],
      ['in', 10]
    ])
  })

  it('raises a low-stock alert only when crossing the threshold', () => {
    const { id } = newItem({ openingQuantity: 8 })
    expect(move({ type: 'out', itemId: id, locationId: store, quantity: 2 }).lowStock).toBeNull() // 6 > 5
    expect(move({ type: 'out', itemId: id, locationId: store, quantity: 1 }).lowStock).toMatchObject({ onHand: 5, minStock: 5 })
    expect(move({ type: 'out', itemId: id, locationId: store, quantity: 1 }).lowStock).toBeNull() // already low
    expect(inv.listItems({ lowStockOnly: true }).map((i) => i.id)).toEqual([id])
  })

  it('blocks movements on archived items and locations, and archiving a location that holds stock', () => {
    const { id } = newItem({ openingQuantity: 3 })
    expect(code(() => inv.setLocationArchived(actor, store, true))).toBe('LOCATION_HAS_STOCK')
    inv.setLocationArchived(actor, office, true)
    expect(code(() => move({ type: 'transfer', itemId: id, fromLocationId: store, toLocationId: office, quantity: 1 }))).toBe('LOCATION_ARCHIVED')
    inv.setItemArchived(actor, id, true)
    expect(code(() => move({ type: 'in', itemId: id, locationId: store, quantity: 1 }))).toBe('ITEM_ARCHIVED')
    expect(inv.listItems().length).toBe(0)
    expect(inv.listItems({ includeArchived: true }).length).toBe(1)
  })

  it('keeps categories that are in use', () => {
    const cat = inv.createCategory(actor, { nameEn: 'Stationery' })
    newItem({ categoryId: cat.id })
    expect(inv.listCategories()[0]?.itemCount).toBe(1)
    expect(code(() => inv.deleteCategory(actor, cat.id))).toBe('CATEGORY_IN_USE')
    expect(code(() => inv.createCategory(actor, { nameEn: 'Stationery' }))).toBe('DUPLICATE')
  })

  it('searches by SKU and name, treating % and _ literally', () => {
    newItem()
    newItem({ sku: 'A4-PAPER', nameEn: 'A4 paper 100%' })
    expect(inv.listItems({ search: 'paper' }).map((i) => i.sku)).toEqual(['A4-PAPER'])
    expect(inv.listItems({ search: '100%' }).map((i) => i.sku)).toEqual(['A4-PAPER'])
    expect(inv.listItems({ search: '%' }).map((i) => i.sku)).toEqual(['A4-PAPER'])
    expect(inv.listItems({ search: 'pen-' }).map((i) => i.sku)).toEqual(['PEN-BLUE'])
  })

  it('computes the dashboard', () => {
    const a = newItem({ openingQuantity: 10 }) // 10 × $0.25
    newItem({ sku: 'STAPLER', nameEn: 'Stapler', minStock: 2, unitCostCents: 500, openingQuantity: 1 }) // low
    move({ type: 'out', itemId: a.id, locationId: store, quantity: 4 })
    const d = inv.dashboard()
    expect(d).toMatchObject({ totalItems: 2, lowStockCount: 1, stockValueCents: 6 * 25 + 500, movementsToday: 3 })
    expect(d.lowStock.map((i) => i.sku)).toEqual(['STAPLER'])
    expect(d.recentMovements).toHaveLength(3)
  })

  it('stores photos inside the database', () => {
    const { id } = newItem()
    inv.setItemPhoto(actor, id, { image: Buffer.from('big'), thumbnail: Buffer.from('small') })
    expect(inv.getItem(id).hasPhoto).toBe(true)
    expect(inv.getItemPhoto(id, 'thumbnail')?.toString()).toBe('small')
    inv.removeItemPhoto(actor, id)
    expect(inv.getItemPhoto(id, 'image')).toBeNull()
  })

  it('audits every change in a valid chain', () => {
    const { id } = newItem({ openingQuantity: 5 })
    move({ type: 'out', itemId: id, locationId: store, quantity: 1 })
    inv.updateItem(actor, { id, sku: 'PEN-BLUE', nameEn: 'Blue pen (box)', unit: 'box', minStock: 1, unitCostCents: 250 })
    const actions = t.sqlite.prepare('select action from audit_log order by id').pluck().all()
    expect(actions).toEqual(['location.create', 'location.create', 'item.create', 'stock.in', 'stock.out', 'item.update'])
    expect(verifyAuditChain(t.db).ok).toBe(true)
  })

  it('exports CSV with Khmer text intact', () => {
    newItem({ nameKm: 'ប៊ិចខៀវ', openingQuantity: 2 })
    const csv = inv.itemsCsv()
    expect(csv.split('\r\n')[1]).toContain('"ប៊ិចខៀវ"')
    expect(inv.movementsCsv().split('\r\n')).toHaveLength(3)
  })
})

describe('toCsv', () => {
  it('quotes text, keeps numbers numeric and neutralises formulas', () => {
    expect(toCsv([['a "b"', 1, -3, null, true, '=HYPERLINK("x")', '+1', '@cmd', '-2']])).toBe(
      `"a ""b""",1,-3,,yes,"'=HYPERLINK(""x"")","'+1","'@cmd","'-2"\r\n`
    )
  })
})

describe('name uniqueness', () => {
  it('treats location and category names case-insensitively', () => {
    const t = openTestDatabase()
    const u = t.db.insert(users).values({ email: 'a@ci.org', displayName: 'A', passwordHash: 'x', role: 'admin' }).returning().get()
    const actor = { id: u.id, email: u.email, displayName: u.displayName, role: u.role }
    const inv = new InventoryService(t.db)
    inv.createLocation(actor, { name: 'Main storeroom' })
    inv.createCategory(actor, { nameEn: 'Stationery' })
    expect(() => inv.createLocation(actor, { name: 'MAIN STOREROOM' })).toThrow(expect.objectContaining({ code: 'DUPLICATE' }))
    expect(() => inv.createCategory(actor, { nameEn: 'stationery' })).toThrow(expect.objectContaining({ code: 'DUPLICATE' }))
    t.cleanup()
  })
})
