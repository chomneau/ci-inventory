import { randomInt } from 'node:crypto'
import { and, count, eq, ne } from 'drizzle-orm'
import { passwordIssues, type PublicUser } from '@shared/auth'
import type { ManagedUser, TemporaryPassword, userCreate, userUpdate } from '@shared/admin'
import type { z } from 'zod'
import { hashPassword } from '../auth/password'
import type { Db } from '../db/client'
import { loginThrottle, recoveryCodes, userTotp, users } from '../db/schema'
import { AppError } from '../ipc/errors'
import { recordAudit, type DbOrTx } from './audit'

// No look-alike characters: temporary passwords are read off a screen and typed.
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

/** 16 random characters in 4 groups, e.g. "hK7m-Pq2x-R9tw-3fGd" (~92 bits). */
export function generateTemporaryPassword(): string {
  for (;;) {
    let raw = ''
    for (let i = 0; i < 16; i++) raw += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]
    const pw = raw.match(/.{4}/g)!.join('-')
    if (passwordIssues(pw).length === 0) return pw
  }
}

/**
 * Account administration. Callers must already have checked the admin role and a
 * recent step-up; this class enforces the business rules that keep the system
 * administrable (never zero admins, no self-lockout) and audits everything.
 */
export class UserAdminService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date()
  ) {}

  list(): ManagedUser[] {
    const now = this.now()
    return this.db
      .select({ user: users, totpEnabledAt: userTotp.enabledAt })
      .from(users)
      .leftJoin(userTotp, eq(userTotp.userId, users.id))
      .orderBy(users.displayName)
      .all()
      .map(({ user: u, totpEnabledAt }) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        disabled: u.disabled,
        locked: u.lockedUntil !== null && u.lockedUntil > now,
        mustChangePassword: u.mustChangePassword,
        authenticatorLinked: totpEnabledAt != null,
        lastLoginAt: u.lastLoginAt?.getTime() ?? null,
        createdAt: u.createdAt.getTime()
      }))
  }

  async create(actor: PublicUser, input: z.output<typeof userCreate>): Promise<TemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)
    const userId = this.db.transaction((tx) => {
      if (tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) throw new AppError('DUPLICATE')
      const row = tx
        .insert(users)
        .values({ email: input.email, displayName: input.displayName, role: input.role, passwordHash, mustChangePassword: true })
        .returning({ id: users.id })
        .get()
      tx.delete(loginThrottle).where(eq(loginThrottle.email, input.email)).run()
      recordAudit(tx, {
        actorUserId: actor.id,
        action: 'user.create',
        entityType: 'user',
        entityId: row.id,
        details: { email: input.email, displayName: input.displayName, role: input.role }
      })
      return row.id
    })
    return { userId, email: input.email, temporaryPassword }
  }

  update(actor: PublicUser, input: z.output<typeof userUpdate>): void {
    this.db.transaction((tx) => {
      const before = this.load(tx, input.id)
      if (before.role !== input.role) {
        if (input.id === actor.id) throw new AppError('CANNOT_CHANGE_SELF')
        if (before.role === 'admin') this.assertAnotherActiveAdmin(tx, input.id)
      }
      tx.update(users).set({ displayName: input.displayName, role: input.role, updatedAt: this.now() }).where(eq(users.id, input.id)).run()
      recordAudit(tx, {
        actorUserId: actor.id,
        action: 'user.update',
        entityType: 'user',
        entityId: input.id,
        details: { before: { displayName: before.displayName, role: before.role }, after: { displayName: input.displayName, role: input.role } }
      })
    })
  }

  setDisabled(actor: PublicUser, id: number, disabled: boolean): void {
    this.db.transaction((tx) => {
      const user = this.load(tx, id)
      if (id === actor.id) throw new AppError('CANNOT_CHANGE_SELF')
      if (disabled && user.role === 'admin') this.assertAnotherActiveAdmin(tx, id)
      tx.update(users).set({ disabled, updatedAt: this.now() }).where(eq(users.id, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: disabled ? 'user.disable' : 'user.enable', entityType: 'user', entityId: id, details: { email: user.email } })
    })
  }

  unlock(actor: PublicUser, id: number): void {
    this.db.transaction((tx) => {
      const user = this.load(tx, id)
      tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, updatedAt: this.now() }).where(eq(users.id, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: 'user.unlock', entityType: 'user', entityId: id, details: { email: user.email } })
    })
  }

  /** Issues a new temporary password; the user must choose their own at next sign-in. */
  async resetPassword(actor: PublicUser, id: number): Promise<TemporaryPassword> {
    if (id === actor.id) throw new AppError('CANNOT_CHANGE_SELF')
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)
    const email = this.db.transaction((tx) => {
      const user = this.load(tx, id)
      tx.update(users)
        .set({ passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, updatedAt: this.now() })
        .where(eq(users.id, id))
        .run()
      recordAudit(tx, { actorUserId: actor.id, action: 'user.reset_password', entityType: 'user', entityId: id, details: { email: user.email } })
      return user.email
    })
    return { userId: id, email, temporaryPassword }
  }

  /** For a lost phone: removes the authenticator and recovery codes; the user re-links at next sign-in. */
  resetAuthenticator(actor: PublicUser, id: number): void {
    if (id === actor.id) throw new AppError('CANNOT_CHANGE_SELF')
    this.db.transaction((tx) => {
      const user = this.load(tx, id)
      tx.delete(userTotp).where(eq(userTotp.userId, id)).run()
      tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: 'user.reset_authenticator', entityType: 'user', entityId: id, details: { email: user.email } })
    })
  }

  private load(tx: DbOrTx, id: number) {
    const user = tx.select().from(users).where(eq(users.id, id)).get()
    if (!user) throw new AppError('NOT_FOUND')
    return user
  }

  /** The app must always keep at least one enabled administrator. */
  private assertAnotherActiveAdmin(tx: DbOrTx, exceptId: number): void {
    const others =
      tx
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.disabled, false), ne(users.id, exceptId)))
        .get()?.n ?? 0
    if (others === 0) throw new AppError('LAST_ADMIN')
  }
}
