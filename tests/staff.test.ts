import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PublicUser } from '@shared/auth'
import { itemCreate, stockMovementInput } from '@shared/inventory'
import { pinIssue, staffInput, staffUpdate } from '@shared/staff'
import { auditLog, stockMovements, users } from '../src/main/db/schema'
import { updateAppSettings } from '../src/main/services/app-settings'
import { verifyAuditChain } from '../src/main/services/audit'
import { InventoryService } from '../src/main/services/inventory'
import { confirmRecipient, StaffService } from '../src/main/services/staff'
import { openTestDatabase } from './helpers'

const code = async (fn: () => unknown) => {
  try {
    await fn()
  } catch (e) {
    return (e as { code?: string }).code
  }
  return 'NO_ERROR'
}

describe('pinIssue', () => {
  it('accepts 4–6 digits and rejects guessable PINs', () => {
    expect(pinIssue('4821')).toBeNull()
    expect(pinIssue('905172')).toBeNull()
    expect(pinIssue('123')).toBe('format')
    expect(pinIssue('1234567')).toBe('format')
    expect(pinIssue('12a4')).toBe('format')
    for (const weak of ['0000', '1111', '1234', '4321', '123456', '987654']) expect(pinIssue(weak)).toBe('too_simple')
  })
})

describe('StaffService and stock-out confirmation', () => {
  let t: ReturnType<typeof openTestDatabase>
  let staff: StaffService
  let inv: InventoryService
  let actor: PublicUser
  let now: Date
  let itemId: number
  let store: number

  const out = (extra: Record<string, unknown>) => stockMovementInput.parse({ type: 'out', itemId, locationId: store, quantity: 2, ...extra })
  /** What the stock:record handler does: confirm the recipient, then record. */
  const issue = async (extra: Record<string, unknown>) => {
    const input = out(extra)
    return inv.recordMovement(actor, input, await confirmRecipient(t.db, staff, actor, input))
  }

  beforeEach(() => {
    t = openTestDatabase()
    const u = t.db.insert(users).values({ email: 'k@ci.org', displayName: 'Keeper', passwordHash: 'x', role: 'storekeeper' }).returning().get()
    actor = { id: u.id, email: u.email, displayName: u.displayName, role: u.role }
    now = new Date('2026-10-22T09:00:00Z')
    staff = new StaffService(t.db, () => now)
    inv = new InventoryService(t.db, () => now)
    store = inv.createLocation(actor, { name: 'Main store' }).id
    itemId = inv.createItem(actor, itemCreate.parse({ sku: 'BAT-AA', nameEn: 'AA battery', unit: 'pcs', minStock: 0, unitCostCents: 50, defaultLocationId: store, openingQuantity: 40 })).id
  })
  afterEach(() => t.cleanup())

  it('generates staff codes and keeps them unique', () => {
    expect(staff.create(actor, staffInput.parse({ name: 'Dara Sok', department: 'Finance' })).code).toBe('S-0001')
    expect(staff.create(actor, staffInput.parse({ name: 'Vanna Kim', code: ' kh-0142 ' })).code).toBe('KH-0142')
    expect(staff.create(actor, staffInput.parse({ name: 'Sophea Chan' })).code).toBe('S-0002')
    expect(() => staff.create(actor, staffInput.parse({ name: 'Copy', code: 'kh-0142' }))).toThrow(expect.objectContaining({ code: 'DUPLICATE' }))
    const dara = staff.list().find((s) => s.name === 'Dara Sok')!
    expect(() => staff.update(actor, staffUpdate.parse({ id: dara.id, code: 'S-0002', name: 'Dara Sok' }))).toThrow(expect.objectContaining({ code: 'DUPLICATE' }))
  })

  it('requires a confirmed recipient for every stock-out by default', async () => {
    expect(await code(() => issue({ issuedTo: 'Finance' }))).toBe('STAFF_CONFIRMATION_REQUIRED')
    // The service itself refuses to link a person without a checked PIN.
    const dara = staff.create(actor, staffInput.parse({ name: 'Dara Sok' }))
    expect(await code(() => inv.recordMovement(actor, out({ staffId: dara.id, pin: '4821' })))).toBe('STAFF_CONFIRMATION_REQUIRED')
    // The office can switch the policy off; free text is then accepted again.
    updateAppSettings(t.db, actor, { requireStaffConfirmation: false })
    expect(await code(() => issue({ issuedTo: 'Finance' }))).toBe('NO_ERROR')
  })

  it('records who received the items, confirmed by their PIN', async () => {
    const dara = staff.create(actor, staffInput.parse({ name: 'Dara Sok', department: 'Finance' }))
    expect(await code(() => issue({ staffId: dara.id, pin: '4821' }))).toBe('PIN_NOT_SET')
    expect(await code(() => staff.setPin(actor, dara.id, '1234'))).toBe('PIN_TOO_SIMPLE')
    await staff.setPin(actor, dara.id, '4821')

    const { movementId } = await issue({ staffId: dara.id, pin: '4821', issuedTo: 'ignored' })
    const [m] = inv.listMovements({ staffId: dara.id })
    expect(m).toMatchObject({ id: movementId, type: 'out', quantity: -2, staffCode: 'S-0001', staffName: 'Dara Sok', issuedTo: 'Dara Sok', confirmation: 'pin' })
    expect(inv.getItem(itemId).onHand).toBe(38)
    expect(staff.get(dara.id)).toMatchObject({ receipts: 1, pinSet: true, pinSetByName: 'Keeper' })
    expect(inv.movementsCsv()).toContain('"Dara Sok","S-0001","PIN"')

    // The audit entry names the recipient and never contains the PIN.
    const audit = t.db.select().from(auditLog).all().map((a) => a.details).join('\n')
    expect(audit).toContain('"confirmation":"pin"')
    expect(audit).not.toContain('4821')
    expect(t.db.select().from(stockMovements).all().every((r) => !JSON.stringify(r).includes('4821'))).toBe(true)
    expect(verifyAuditChain(t.db).ok).toBe(true)
  })

  it('rejects wrong PINs, locks after five, and audits every failure', async () => {
    const dara = staff.create(actor, staffInput.parse({ name: 'Dara Sok' }))
    await staff.setPin(actor, dara.id, '4821')
    for (let i = 0; i < 4; i++) expect(await code(() => issue({ staffId: dara.id, pin: '9999' }))).toBe('PIN_WRONG')
    expect(await code(() => issue({ staffId: dara.id, pin: '9999' }))).toBe('PIN_LOCKED')
    // Locked: even the right PIN is refused, and nothing was issued.
    expect(await code(() => issue({ staffId: dara.id, pin: '4821' }))).toBe('PIN_LOCKED')
    expect(inv.getItem(itemId).onHand).toBe(40)
    expect(staff.get(dara.id).pinLocked).toBe(true)
    expect(t.db.select().from(auditLog).all().filter((a) => a.action === 'staff.pin_failed')).toHaveLength(5)

    // The lock expires; a correct PIN then works and resets the counter.
    now = new Date(now.getTime() + 2 * 60_000)
    expect(await code(() => issue({ staffId: dara.id, pin: '4821' }))).toBe('NO_ERROR')
    expect(await code(() => issue({ staffId: dara.id, pin: '9999' }))).toBe('PIN_WRONG')

    // Choosing a new PIN clears a lockout immediately.
    for (let i = 0; i < 5; i++) await code(() => issue({ staffId: dara.id, pin: '9999' }))
    await staff.setPin(actor, dara.id, '5038')
    expect(await code(() => issue({ staffId: dara.id, pin: '5038' }))).toBe('NO_ERROR')
  })

  it('refuses archived staff and a missing PIN without counting a failure', async () => {
    const dara = staff.create(actor, staffInput.parse({ name: 'Dara Sok' }))
    await staff.setPin(actor, dara.id, '4821')
    expect(await code(() => issue({ staffId: dara.id }))).toBe('INVALID_INPUT')
    expect(t.db.select().from(auditLog).all().some((a) => a.action === 'staff.pin_failed')).toBe(false)
    staff.setArchived(actor, dara.id, true)
    expect(await code(() => issue({ staffId: dara.id, pin: '4821' }))).toBe('STAFF_ARCHIVED')
    expect(staff.list().map((s) => s.id)).not.toContain(dara.id)
    expect(staff.list(true).find((s) => s.id === dara.id)?.archived).toBe(true)
  })
})
