import { and, count, eq, isNull } from 'drizzle-orm'
import { timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import { passwordIssues, type AuthStatus, type PublicUser, type TotpEnrollment } from '@shared/auth'
import type { Db } from '../db/client'
import { loginThrottle, recoveryCodes, userTotp, users } from '../db/schema'
import { AppError } from '../ipc/errors'
import { recordAudit } from '../services/audit'
import { lockoutUntil } from './lockout'
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password'
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes'
import { openSecret, sealSecret } from './secret-box'
import { clockOffsetSteps, formatManualKey, generateTotpSecret, offsetMinutes, otpauthUri, verifyTotp } from './totp'

type PendingStage = 'totp_required' | 'enrollment_required' | 'recovery_codes' | 'password_change_required'

type State =
  | { stage: 'signed_out' }
  | { stage: PendingStage; userId: number; email: string; expiresAt: number; attempts: number }
  | { stage: 'signed_in'; user: PublicUser }
  | { stage: 'locked'; user: PublicUser; attempts: number }

/** A half-finished sign-in is abandoned after 10 minutes. */
const PENDING_TTL_MS = 10 * 60_000
/** How long a step-up (re-entered authenticator code) keeps admin actions unlocked. */
const STEP_UP_TTL_MS = 5 * 60_000
/** Wrong codes / unlock passwords allowed within one stage before starting over. */
const MAX_STAGE_ATTEMPTS = 5

export type LockReason = 'user' | 'idle' | 'os' | 'window_closed'

export interface AuthServiceOptions {
  db: Db
  /** 32-byte key used to seal TOTP secrets at rest. */
  totpKey: Buffer
  issuer?: string
  /**
   * This computer's name, added to the authenticator entry ("sokha@ci.org (OFFICE-PC)") so
   * installs on different computers don't show up as identical entries on the phone.
   */
  deviceName?: string
  now?: () => Date
  onChange?: (status: AuthStatus) => void
}

type UserRow = typeof users.$inferSelect

/**
 * Owns the single sign-in session of this app instance. All authentication
 * decisions are made here, in the main process; the renderer only sees AuthStatus.
 */
export class AuthService {
  private state: State = { stage: 'signed_out' }
  /** Until when admin actions are allowed without re-entering an authenticator code. */
  private stepUpUntil = 0
  private readonly db: Db
  private readonly totpKey: Buffer
  private readonly issuer: string
  private readonly deviceName: string | null
  private readonly now: () => Date
  private readonly onChange?: (status: AuthStatus) => void
  /** Serializes password checks so parallel attempts cannot all slip past the lockout check. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(opts: AuthServiceOptions) {
    this.db = opts.db
    this.totpKey = opts.totpKey
    this.issuer = opts.issuer ?? 'CI Inventory'
    this.deviceName = opts.deviceName?.trim() || null
    this.now = opts.now ?? (() => new Date())
    this.onChange = opts.onChange
  }

  // ---------------------------------------------------------------- queries

  status(): AuthStatus {
    const s = this.state
    switch (s.stage) {
      case 'signed_out':
        return this.hasUsers() ? { stage: 'signed_out' } : { stage: 'setup_required' }
      case 'signed_in':
      case 'locked':
        return { stage: s.stage, user: s.user }
      default:
        return { stage: s.stage, email: s.email }
    }
  }

  /** The fully signed-in user, or null (locked and half-signed-in sessions count as no user). */
  currentUser(): PublicUser | null {
    return this.state.stage === 'signed_in' ? this.state.user : null
  }

  // ---------------------------------------------------------------- first run

  setupAdmin(input: { email: string; displayName: string; password: string }): Promise<AuthStatus> {
    return this.exclusive(() => this.setupAdminNow(input))
  }

  private async setupAdminNow(input: { email: string; displayName: string; password: string }): Promise<AuthStatus> {
    const email = input.email.trim().toLowerCase()
    this.assertStrongPassword(input.password, email)
    if (this.hasUsers()) throw new AppError('SETUP_ALREADY_DONE')
    const passwordHash = await hashPassword(input.password)

    const user = this.db.transaction((tx) => {
      // Re-check inside the transaction: only the very first account may be created this way.
      const existing = tx.select({ n: count() }).from(users).get()
      if ((existing?.n ?? 0) > 0) throw new AppError('SETUP_ALREADY_DONE')
      const created = tx
        .insert(users)
        .values({ email, displayName: input.displayName.trim(), passwordHash, role: 'admin' })
        .returning()
        .get()
      recordAudit(tx, { actorUserId: created.id, action: 'auth.setup_admin', entityType: 'user', entityId: created.id, details: { email } })
      return created
    })
    this.setPending('enrollment_required', user)
    return this.status()
  }

  // ---------------------------------------------------------------- sign in

  login(input: { email: string; password: string }): Promise<AuthStatus> {
    return this.exclusive(() => this.loginNow(input))
  }

  private async loginNow(input: { email: string; password: string }): Promise<AuthStatus> {
    if (this.state.stage === 'signed_in' || this.state.stage === 'locked') throw new AppError('WRONG_STAGE')
    const email = input.email.trim().toLowerCase()
    const now = this.now()
    const user = this.db.select().from(users).where(eq(users.email, email)).get()

    if (!user) {
      // Unknown emails are throttled exactly like real accounts (persisted, so restarts do not reset it).
      const rec = this.db.select().from(loginThrottle).where(eq(loginThrottle.email, email)).get()
      if (rec?.lockedUntil && rec.lockedUntil > now) throw lockedError(rec.lockedUntil, now)
      await verifyAgainstDummy(input.password)
      const failures = (rec?.failures ?? 0) + 1
      const lockedUntil = lockoutUntil(failures, now)
      this.db.transaction((tx) => {
        const values = { failures, lockedUntil, updatedAt: now }
        tx.insert(loginThrottle).values({ email, ...values }).onConflictDoUpdate({ target: loginThrottle.email, set: values }).run()
        recordAudit(tx, { actorUserId: null, action: 'auth.login_failed', details: { email, reason: 'unknown_email' } })
      })
      if (lockedUntil) throw lockedError(lockedUntil, now)
      throw new AppError('INVALID_CREDENTIALS')
    }

    if (user.lockedUntil && user.lockedUntil > now) throw lockedError(user.lockedUntil, now)

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const lockedUntil = this.registerFailure(user.id, 'bad_password')
      if (lockedUntil) throw lockedError(lockedUntil, now)
      throw new AppError('INVALID_CREDENTIALS')
    }

    // Only revealed after the correct password, so it cannot be used to probe accounts.
    if (user.disabled) {
      recordAudit(this.db, { actorUserId: user.id, action: 'auth.login_failed', entityType: 'user', entityId: user.id, details: { reason: 'disabled' } })
      throw new AppError('ACCOUNT_DISABLED')
    }

    const totp = this.db.select().from(userTotp).where(eq(userTotp.userId, user.id)).get()
    this.setPending(totp?.enabledAt ? 'totp_required' : 'enrollment_required', user)
    return this.status()
  }

  verifyTotp(input: { code: string }): AuthStatus {
    const pending = this.expectPending('totp_required')
    const row = this.db.select().from(userTotp).where(eq(userTotp.userId, pending.userId)).get()
    if (!row?.enabledAt) throw new AppError('WRONG_STAGE')

    const secret = openSecret(this.totpKey, row.secretEncrypted, totpContext(pending.userId))
    const step = verifyTotp(secret, input.code, this.now(), row.lastUsedStep)
    if (step === null) this.failSecondFactor(pending, 'bad_totp', clockOffsetSteps(secret, input.code, this.now()))

    this.db.update(userTotp).set({ lastUsedStep: step }).where(eq(userTotp.userId, pending.userId)).run()
    return this.afterSecondFactor(pending.userId, 'totp')
  }

  useRecoveryCode(input: { code: string }): AuthStatus {
    const pending = this.expectPending('totp_required')
    const wanted = Buffer.from(hashRecoveryCode(input.code))
    const unused = this.db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, pending.userId), isNull(recoveryCodes.usedAt)))
      .all()
    const match = unused.find((r) => timingSafeEqual(Buffer.from(r.codeHash), wanted))
    if (!match) this.failSecondFactor(pending, 'bad_recovery_code')

    this.db.transaction((tx) => {
      tx.update(recoveryCodes).set({ usedAt: this.now() }).where(eq(recoveryCodes.id, match.id)).run()
      recordAudit(tx, {
        actorUserId: pending.userId,
        action: 'auth.recovery_code_used',
        entityType: 'user',
        entityId: pending.userId,
        details: { remaining: unused.length - 1 }
      })
    })
    return this.afterSecondFactor(pending.userId, 'recovery_code')
  }

  // ---------------------------------------------------------------- authenticator enrollment

  async beginEnrollment(): Promise<TotpEnrollment> {
    const pending = this.expectPending('enrollment_required')
    const secret = generateTotpSecret()
    const sealed = sealSecret(this.totpKey, secret, totpContext(pending.userId))
    this.db
      .insert(userTotp)
      .values({ userId: pending.userId, secretEncrypted: sealed, enabledAt: null, lastUsedStep: null })
      .onConflictDoUpdate({ target: userTotp.userId, set: { secretEncrypted: sealed, enabledAt: null, lastUsedStep: null } })
      .run()

    const account = this.deviceName ? `${pending.email} (${this.deviceName})` : pending.email
    const uri = otpauthUri(secret, this.issuer, account)
    const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
    return { qrDataUrl, manualKey: formatManualKey(secret), issuer: this.issuer, account }
  }

  confirmEnrollment(input: { code: string }): { status: AuthStatus; recoveryCodes: string[] } {
    const pending = this.expectPending('enrollment_required')
    const row = this.db.select().from(userTotp).where(eq(userTotp.userId, pending.userId)).get()
    if (!row || row.enabledAt) throw new AppError('WRONG_STAGE')

    const secret = openSecret(this.totpKey, row.secretEncrypted, totpContext(pending.userId))
    const step = verifyTotp(secret, input.code, this.now(), null)
    if (step === null) {
      // Usually a scanning mistake rather than an attack: count per stage, not against the account.
      this.countStageAttempt(pending)
      const offset = clockOffsetSteps(secret, input.code, this.now())
      if (offset !== null) throw new AppError('CLOCK_SKEW', { count: offsetMinutes(offset) })
      throw new AppError('INVALID_CODE')
    }

    const codes = generateRecoveryCodes()
    this.db.transaction((tx) => {
      tx.update(userTotp).set({ enabledAt: this.now(), lastUsedStep: step }).where(eq(userTotp.userId, pending.userId)).run()
      tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, pending.userId)).run()
      tx.insert(recoveryCodes)
        .values(codes.map((c) => ({ userId: pending.userId, codeHash: hashRecoveryCode(c) })))
        .run()
      recordAudit(tx, { actorUserId: pending.userId, action: 'auth.totp_enrolled', entityType: 'user', entityId: pending.userId })
    })
    this.setState({ ...pending, stage: 'recovery_codes', attempts: 0 })
    return { status: this.status(), recoveryCodes: codes }
  }

  acknowledgeRecoveryCodes(): AuthStatus {
    const pending = this.expectPending('recovery_codes')
    return this.afterSecondFactor(pending.userId, 'enrollment')
  }

  // ---------------------------------------------------------------- password change

  changePassword(input: { currentPassword?: string; newPassword: string; code?: string }): Promise<AuthStatus> {
    return this.exclusive(() => this.changePasswordNow(input))
  }

  private async changePasswordNow(input: { currentPassword?: string; newPassword: string; code?: string }): Promise<AuthStatus> {
    const s = this.state
    if (s.stage === 'password_change_required') {
      this.expectPending('password_change_required')
      const user = this.loadUser(s.userId)
      await this.applyNewPassword(user, input.newPassword, true)
      this.completeSignIn(this.loadUser(s.userId), 'password_change')
      return this.status()
    }

    if (s.stage !== 'signed_in') throw new AppError('WRONG_STAGE')
    const user = this.loadUser(s.user.id)
    // A voluntary change needs both factors, so an unattended unlocked PC is not enough.
    if (!input.currentPassword || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      if (this.registerFailure(user.id, 'bad_password_on_change')) this.forceSignOut()
      throw new AppError('INVALID_CREDENTIALS')
    }
    this.verifyOwnTotp(user.id, input.code ?? '')
    await this.applyNewPassword(user, input.newPassword, false)
    return this.status()
  }

  // ---------------------------------------------------------------- lock / unlock / sign out

  lock(reason: LockReason = 'user'): AuthStatus {
    const s = this.state
    if (s.stage === 'signed_in') {
      recordAudit(this.db, { actorUserId: s.user.id, action: 'auth.lock', details: { reason } })
      this.setState({ stage: 'locked', user: s.user, attempts: 0 })
    } else if (s.stage !== 'locked' && s.stage !== 'signed_out') {
      // Walking away from a half-finished sign-in abandons it.
      this.setState({ stage: 'signed_out' })
    }
    return this.status()
  }

  unlock(input: { password: string }): Promise<AuthStatus> {
    return this.exclusive(() => this.unlockNow(input))
  }

  private async unlockNow(input: { password: string }): Promise<AuthStatus> {
    const s = this.state
    if (s.stage !== 'locked') throw new AppError('WRONG_STAGE')
    const now = this.now()
    const user = this.loadUser(s.user.id)
    if (user.disabled) {
      this.forceSignOut()
      throw new AppError('ACCOUNT_DISABLED')
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      this.forceSignOut()
      throw lockedError(user.lockedUntil, now)
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const lockedUntil = this.registerFailure(user.id, 'bad_unlock_password')
      s.attempts++
      if (lockedUntil || s.attempts >= MAX_STAGE_ATTEMPTS) {
        this.forceSignOut()
        if (lockedUntil) throw lockedError(lockedUntil, now)
        throw new AppError('SESSION_EXPIRED')
      }
      throw new AppError('INVALID_CREDENTIALS')
    }
    this.db.transaction((tx) => {
      tx.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id)).run()
      recordAudit(tx, { actorUserId: user.id, action: 'auth.unlock' })
    })
    this.setState({ stage: 'signed_in', user: s.user })
    return this.status()
  }

  logout(): AuthStatus {
    const s = this.state
    if (s.stage === 'signed_in' || s.stage === 'locked') {
      recordAudit(this.db, { actorUserId: s.user.id, action: 'auth.logout' })
    }
    this.setState({ stage: 'signed_out' })
    return this.status()
  }

  // ---------------------------------------------------------------- step-up & self-service

  /**
   * Re-confirms the signed-in user with an authenticator code. Sensitive admin
   * actions (user management, backup, restore) then stay allowed for 5 minutes.
   */
  stepUp(input: { code: string }): void {
    const user = this.requireSignedIn()
    this.verifyOwnTotp(user.id, input.code)
    this.stepUpUntil = this.now().getTime() + STEP_UP_TTL_MS
    recordAudit(this.db, { actorUserId: user.id, action: 'auth.step_up', entityType: 'user', entityId: user.id })
  }

  /** Throws STEP_UP_REQUIRED unless the user re-confirmed recently. */
  assertStepUp(): void {
    this.requireSignedIn()
    if (this.now().getTime() > this.stepUpUntil) throw new AppError('STEP_UP_REQUIRED')
  }

  /** Replaces the signed-in user's recovery codes; the old ones stop working. */
  regenerateRecoveryCodes(input: { code: string }): string[] {
    const user = this.requireSignedIn()
    this.verifyOwnTotp(user.id, input.code)
    const codes = generateRecoveryCodes()
    this.db.transaction((tx) => {
      tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id)).run()
      tx.insert(recoveryCodes)
        .values(codes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })))
        .run()
      recordAudit(tx, { actorUserId: user.id, action: 'auth.recovery_codes_regenerated', entityType: 'user', entityId: user.id })
    })
    return codes
  }

  // ---------------------------------------------------------------- internals

  private requireSignedIn(): PublicUser {
    if (this.state.stage !== 'signed_in') throw new AppError('UNAUTHENTICATED')
    return this.state.user
  }

  /** Checks a code from the user's own authenticator (with replay protection) and records its time step. */
  private verifyOwnTotp(userId: number, code: string): void {
    const totp = this.db.select().from(userTotp).where(eq(userTotp.userId, userId)).get()
    const step =
      totp?.enabledAt && /^\d{6}$/.test(code)
        ? verifyTotp(openSecret(this.totpKey, totp.secretEncrypted, totpContext(userId)), code, this.now(), totp.lastUsedStep)
        : null
    if (step === null) throw new AppError('INVALID_CODE')
    this.db.update(userTotp).set({ lastUsedStep: step }).where(eq(userTotp.userId, userId)).run()
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  private hasUsers(): boolean {
    return (this.db.select({ n: count() }).from(users).get()?.n ?? 0) > 0
  }

  private loadUser(id: number): UserRow {
    const user = this.db.select().from(users).where(eq(users.id, id)).get()
    if (!user) {
      this.forceSignOut()
      throw new AppError('SESSION_EXPIRED')
    }
    return user
  }

  private setState(next: State): void {
    this.state = next
    if (next.stage !== 'signed_in') this.stepUpUntil = 0
    this.onChange?.(this.status())
  }

  private forceSignOut(): void {
    this.setState({ stage: 'signed_out' })
  }

  private setPending(stage: PendingStage, user: UserRow): void {
    this.setState({ stage, userId: user.id, email: user.email, expiresAt: this.now().getTime() + PENDING_TTL_MS, attempts: 0 })
  }

  private expectPending(stage: PendingStage) {
    const s = this.state
    if (s.stage !== stage) throw new AppError('WRONG_STAGE')
    if (this.now().getTime() > s.expiresAt) {
      this.forceSignOut()
      throw new AppError('SESSION_EXPIRED')
    }
    return s
  }

  private countStageAttempt(pending: Extract<State, { attempts: number; userId: number }>): void {
    pending.attempts++
    if (pending.attempts >= MAX_STAGE_ATTEMPTS) {
      this.forceSignOut()
      throw new AppError('SESSION_EXPIRED')
    }
  }

  /** A wrong second factor counts against the account (the password was already right). */
  /** `clockOffset`: set when the code was right for another time, so the message can point at the clock. */
  private failSecondFactor(pending: Extract<State, { attempts: number; userId: number }>, reason: string, clockOffset: number | null = null): never {
    const now = this.now()
    const lockedUntil = this.registerFailure(pending.userId, reason)
    if (lockedUntil) {
      this.forceSignOut()
      throw lockedError(lockedUntil, now)
    }
    this.countStageAttempt(pending)
    if (clockOffset !== null) throw new AppError('CLOCK_SKEW', { count: offsetMinutes(clockOffset) })
    throw new AppError('INVALID_CODE')
  }

  /** Records a failed attempt; returns the lock expiry if this failure locked the account. */
  private registerFailure(userId: number, reason: string): Date | null {
    const now = this.now()
    return this.db.transaction((tx) => {
      const row = tx.select({ n: users.failedLoginCount }).from(users).where(eq(users.id, userId)).get()
      const failures = (row?.n ?? 0) + 1
      const lockedUntil = lockoutUntil(failures, now)
      tx.update(users).set({ failedLoginCount: failures, lockedUntil }).where(eq(users.id, userId)).run()
      recordAudit(tx, { actorUserId: userId, action: 'auth.login_failed', entityType: 'user', entityId: userId, details: { reason, failures } })
      if (lockedUntil) {
        recordAudit(tx, { actorUserId: userId, action: 'auth.account_locked', entityType: 'user', entityId: userId, details: { until: lockedUntil } })
      }
      return lockedUntil
    })
  }

  private afterSecondFactor(userId: number, method: string): AuthStatus {
    const user = this.loadUser(userId)
    if (user.mustChangePassword) {
      this.setPending('password_change_required', user)
    } else {
      this.completeSignIn(user, method)
    }
    return this.status()
  }

  private completeSignIn(user: UserRow, method: string): void {
    this.db.transaction((tx) => {
      tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: this.now() }).where(eq(users.id, user.id)).run()
      recordAudit(tx, { actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, details: { method } })
    })
    this.setState({
      stage: 'signed_in',
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }
    })
  }

  private assertStrongPassword(password: string, email: string): void {
    const issues = passwordIssues(password, email)
    if (issues.length > 0) throw new AppError('WEAK_PASSWORD', { issues: issues.join(',') })
  }

  private async applyNewPassword(user: UserRow, newPassword: string, forced: boolean): Promise<void> {
    this.assertStrongPassword(newPassword, user.email)
    if (await verifyPassword(user.passwordHash, newPassword)) throw new AppError('PASSWORD_REUSED')
    const passwordHash = await hashPassword(newPassword)
    this.db.transaction((tx) => {
      tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: this.now() }).where(eq(users.id, user.id)).run()
      recordAudit(tx, { actorUserId: user.id, action: 'auth.password_changed', entityType: 'user', entityId: user.id, details: { forced } })
    })
  }
}

function totpContext(userId: number): string {
  return `user_totp:${userId}`
}

function lockedError(until: Date, now: Date): AppError {
  return new AppError('ACCOUNT_LOCKED', { retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)) })
}
