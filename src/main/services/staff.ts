import { asc, eq, isNull, like, sql } from 'drizzle-orm'
import type { PublicUser } from '@shared/auth'
import type { stockMovementInput } from '@shared/inventory'
import { pinIssue, type StaffMember, type staffInput, type staffUpdate } from '@shared/staff'
import type { z } from 'zod'
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/password'
import { lockoutUntil } from '../auth/lockout'
import type { Db } from '../db/client'
import { staff } from '../db/schema'
import { AppError } from '../ipc/errors'
import { getAppSettings } from './app-settings'
import { recordAudit } from './audit'

/** A recipient whose PIN was just checked; the only way to link a stock-out to a person. */
export interface ConfirmedStaff {
  id: number
  code: string
  name: string
  method: 'pin'
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
}

/**
 * The staff directory and receipt confirmation. PINs are Argon2id-hashed like
 * passwords, never logged or returned, and lock after repeated wrong entries.
 * Every change and every failed PIN is written to the audit log.
 */
export class StaffService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date()
  ) {}

  list(includeArchived = false): StaffMember[] {
    const now = this.now()
    const setBy = sql<string | null>`(select u.display_name from users u where u.id = "staff"."pin_set_by")`
    return this.db
      .select({
        row: staff,
        pinSetByName: setBy,
        receipts: sql<number>`(select count(*) from stock_movements m where m.staff_id = "staff"."id")`,
        lastReceiptAt: sql<number | null>`(select max(m.created_at) from stock_movements m where m.staff_id = "staff"."id")`
      })
      .from(staff)
      .where(includeArchived ? undefined : isNull(staff.archivedAt))
      .orderBy(asc(staff.name))
      .all()
      .map(({ row, pinSetByName, receipts, lastReceiptAt }) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        department: row.department,
        pinSet: row.pinHash !== null,
        pinLocked: row.pinLockedUntil !== null && row.pinLockedUntil > now,
        pinSetAt: row.pinSetAt?.getTime() ?? null,
        pinSetByName,
        archived: row.archivedAt !== null,
        receipts,
        lastReceiptAt,
        createdAt: row.createdAt.getTime()
      }))
  }

  get(id: number): StaffMember {
    const member = this.list(true).find((s) => s.id === id)
    if (!member) throw new AppError('NOT_FOUND')
    return member
  }

  create(actor: PublicUser, input: z.output<typeof staffInput>): StaffMember {
    const id = this.unique(() =>
      this.db.transaction((tx) => {
        const code = input.code ?? this.nextCode(tx)
        const row = tx
          .insert(staff)
          .values({ code, name: input.name, department: input.department ?? null })
          .returning({ id: staff.id })
          .get()
        recordAudit(tx, { actorUserId: actor.id, action: 'staff.create', entityType: 'staff', entityId: row.id, details: { code, name: input.name, department: input.department ?? null } })
        return row.id
      })
    )
    return this.get(id)
  }

  update(actor: PublicUser, input: z.output<typeof staffUpdate>): StaffMember {
    this.unique(() =>
      this.db.transaction((tx) => {
        const before = this.load(tx, input.id)
        tx.update(staff)
          .set({ code: input.code, name: input.name, department: input.department ?? null, updatedAt: this.now() })
          .where(eq(staff.id, input.id))
          .run()
        recordAudit(tx, {
          actorUserId: actor.id,
          action: 'staff.update',
          entityType: 'staff',
          entityId: input.id,
          details: {
            before: { code: before.code, name: before.name, department: before.department },
            after: { code: input.code, name: input.name, department: input.department ?? null }
          }
        })
      })
    )
    return this.get(input.id)
  }

  setArchived(actor: PublicUser, id: number, archived: boolean): void {
    this.db.transaction((tx) => {
      const row = this.load(tx, id)
      tx.update(staff).set({ archivedAt: archived ? this.now() : null, updatedAt: this.now() }).where(eq(staff.id, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: archived ? 'staff.archive' : 'staff.restore', entityType: 'staff', entityId: id, details: { code: row.code } })
    })
  }

  /** The person types their new PIN (twice) on the storekeeper's screen. Also clears a lockout. */
  async setPin(actor: PublicUser, id: number, pin: string): Promise<void> {
    const issue = pinIssue(pin)
    if (issue) throw new AppError(issue === 'format' ? 'INVALID_INPUT' : 'PIN_TOO_SIMPLE')
    this.load(this.db, id)
    const pinHash = await hashPassword(pin)
    this.db.transaction((tx) => {
      const row = this.load(tx, id)
      const now = this.now()
      tx.update(staff)
        .set({ pinHash, pinSetAt: now, pinSetBy: actor.id, pinFailedCount: 0, pinLockedUntil: null, updatedAt: now })
        .where(eq(staff.id, id))
        .run()
      recordAudit(tx, { actorUserId: actor.id, action: row.pinHash ? 'staff.pin_reset' : 'staff.pin_set', entityType: 'staff', entityId: id, details: { code: row.code } })
    })
  }

  /**
   * Checks the recipient's PIN. Wrong PINs count towards a lockout (5 tries, then
   * 1, 2, 4… minutes) and are audited, so guessing leaves a trail.
   */
  async confirmPin(actor: PublicUser, id: number, pin: string): Promise<ConfirmedStaff> {
    const row = this.db.select().from(staff).where(eq(staff.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND')
    if (row.archivedAt) throw new AppError('STAFF_ARCHIVED')
    if (!row.pinHash) throw new AppError('PIN_NOT_SET')
    const now = this.now()
    if (row.pinLockedUntil && row.pinLockedUntil > now) {
      throw new AppError('PIN_LOCKED', { count: Math.ceil((row.pinLockedUntil.getTime() - now.getTime()) / 60_000) })
    }
    const ok = pinIssue(pin) === 'format' ? await verifyAgainstDummy(pin) : await verifyPassword(row.pinHash, pin)
    if (!ok) {
      const failures = row.pinFailedCount + 1
      const lockedUntil = lockoutUntil(failures, now)
      this.db.transaction((tx) => {
        tx.update(staff).set({ pinFailedCount: failures, pinLockedUntil: lockedUntil }).where(eq(staff.id, id)).run()
        recordAudit(tx, { actorUserId: actor.id, action: 'staff.pin_failed', entityType: 'staff', entityId: id, details: { code: row.code, failures, locked: lockedUntil !== null } })
      })
      if (lockedUntil) throw new AppError('PIN_LOCKED', { count: Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000) })
      throw new AppError('PIN_WRONG')
    }
    if (row.pinFailedCount > 0) this.db.update(staff).set({ pinFailedCount: 0, pinLockedUntil: null }).where(eq(staff.id, id)).run()
    return { id: row.id, code: row.code, name: row.name, method: 'pin' }
  }

  private load(db: Pick<Db, 'select'>, id: number) {
    const row = db.select().from(staff).where(eq(staff.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND')
    return row
  }

  /** Next free generated code: S-0001, S-0002… (codes typed by hand are left alone). */
  private nextCode(db: Pick<Db, 'select'>): string {
    const codes = db.select({ code: staff.code }).from(staff).where(like(staff.code, 'S-%')).all()
    const max = codes.reduce((m, { code }) => Math.max(m, /^S-(\d+)$/.test(code) ? Number(code.slice(2)) : 0), 0)
    return `S-${String(max + 1).padStart(4, '0')}`
  }

  private unique<T>(fn: () => T): T {
    try {
      return fn()
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('DUPLICATE')
      throw err
    }
  }
}

/**
 * Policy for stock leaving the store: when the office requires it (the default),
 * every stock-out must name a staff member who confirms with their PIN.
 * Returns the confirmed recipient, or null when none is needed.
 */
export async function confirmRecipient(
  db: Db,
  staffService: StaffService,
  actor: PublicUser,
  input: z.output<typeof stockMovementInput>
): Promise<ConfirmedStaff | null> {
  if (input.type !== 'out') return null
  if (input.staffId) {
    if (!input.pin) throw new AppError('INVALID_INPUT') // not a wrong PIN: nothing was typed
    return staffService.confirmPin(actor, input.staffId, input.pin)
  }
  if (getAppSettings(db).requireStaffConfirmation) throw new AppError('STAFF_CONFIRMATION_REQUIRED')
  return null
}
