import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthStatus } from '@shared/auth'
import { AuthService } from '../src/main/auth/auth-service'
import { hashPassword } from '../src/main/auth/password'
import { timeStep, totpAt } from '../src/main/auth/totp'
import { auditLog, users } from '../src/main/db/schema'
import { verifyAuditChain } from '../src/main/services/audit'
import { openTestDatabase } from './helpers'

const ADMIN = { email: 'Admin@CI.org ', displayName: 'Dara Admin', password: 'river-mango-lantern-42' }

/** Test clock that can be moved forward. */
function clock(start = 1_800_000_000_000) {
  let t = start
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) }
}

async function expectCode(p: Promise<unknown> | (() => unknown), code: string) {
  const run = typeof p === 'function' ? Promise.resolve().then(p) : p
  await expect(run).rejects.toMatchObject({ code })
}

describe('AuthService', () => {
  let t: ReturnType<typeof openTestDatabase>
  let c: ReturnType<typeof clock>
  let auth: AuthService
  let changes: AuthStatus[]
  let secret: string

  const currentCode = (offsetSteps = 0) => totpAt(secret, timeStep(c.now()) + offsetSteps)

  /** First run: create admin, enroll the authenticator, acknowledge codes. */
  async function setupAdmin(): Promise<string[]> {
    await auth.setupAdmin(ADMIN)
    const enrollment = await auth.beginEnrollment()
    secret = enrollment.manualKey.replace(/ /g, '')
    expect(enrollment.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    const { recoveryCodes } = auth.confirmEnrollment({ code: currentCode() })
    auth.acknowledgeRecoveryCodes()
    return recoveryCodes
  }

  beforeEach(() => {
    t = openTestDatabase()
    c = clock()
    changes = []
    auth = new AuthService({ db: t.db, totpKey: randomBytes(32), now: c.now, onChange: (s) => changes.push(s) })
  })
  afterEach(() => t.cleanup())

  it('requires setup on first run, then signs the admin in after enrollment', async () => {
    expect(auth.status()).toEqual({ stage: 'setup_required' })
    const codes = await setupAdmin()
    expect(codes).toHaveLength(10)
    expect(auth.status()).toMatchObject({ stage: 'signed_in', user: { email: 'admin@ci.org', role: 'admin' } })
    expect(changes.map((s) => s.stage)).toEqual(['enrollment_required', 'recovery_codes', 'signed_in'])
    await expectCode(auth.setupAdmin({ ...ADMIN, email: 'second@ci.org' }), 'SETUP_ALREADY_DONE')
  })

  it('rejects a weak admin password', async () => {
    await expectCode(auth.setupAdmin({ ...ADMIN, password: 'password123' }), 'WEAK_PASSWORD')
  })

  it('stores the TOTP secret sealed, never in plaintext', async () => {
    await setupAdmin()
    const row = t.sqlite.prepare('SELECT secret_encrypted FROM user_totp').get() as { secret_encrypted: string }
    expect(row.secret_encrypted.startsWith('v1.')).toBe(true)
    expect(row.secret_encrypted).not.toContain(secret)
  })

  it('signs in with password + authenticator code and rejects a replayed code', async () => {
    await setupAdmin()
    auth.logout()
    c.advance(60_000)
    await auth.login({ email: 'ADMIN@ci.org', password: ADMIN.password })
    expect(auth.status()).toEqual({ stage: 'totp_required', email: 'admin@ci.org' })
    const code = currentCode()
    expect(auth.verifyTotp({ code }).stage).toBe('signed_in')

    auth.logout()
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    await expectCode(() => auth.verifyTotp({ code }), 'INVALID_CODE')
  })

  it('gives the same answer for unknown email and wrong password, and locks both after 5 tries', async () => {
    await setupAdmin()
    auth.logout()
    for (let i = 0; i < 4; i++) {
      await expectCode(auth.login({ email: 'admin@ci.org', password: 'wrong-password-xx' }), 'INVALID_CREDENTIALS')
      await expectCode(auth.login({ email: 'nobody@ci.org', password: 'wrong-password-xx' }), 'INVALID_CREDENTIALS')
    }
    await expect(auth.login({ email: 'admin@ci.org', password: 'wrong' })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', details: { retryAfterSeconds: 60 } })
    await expect(auth.login({ email: 'nobody@ci.org', password: 'wrong' })).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', details: { retryAfterSeconds: 60 } })

    // Even the right password is refused while locked...
    await expectCode(auth.login({ email: 'admin@ci.org', password: ADMIN.password }), 'ACCOUNT_LOCKED')
    // ...and accepted after the lock expires.
    c.advance(61_000)
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    auth.verifyTotp({ code: currentCode() })
    const row = t.db.select().from(users).where(eq(users.email, 'admin@ci.org')).get()!
    expect(row.failedLoginCount).toBe(0)
  })

  it('counts wrong authenticator codes against the account', async () => {
    await setupAdmin()
    auth.logout()
    c.advance(60_000)
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    for (let i = 0; i < 4; i++) await expectCode(() => auth.verifyTotp({ code: '000000' }), 'INVALID_CODE')
    await expectCode(() => auth.verifyTotp({ code: '000000' }), 'ACCOUNT_LOCKED')
    expect(auth.status().stage).toBe('signed_out')
  })

  it('accepts each recovery code exactly once', async () => {
    const codes = await setupAdmin()
    auth.logout()
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    expect(auth.useRecoveryCode({ code: codes[3]!.toLowerCase() }).stage).toBe('signed_in')
    auth.logout()
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    await expectCode(() => auth.useRecoveryCode({ code: codes[3]! }), 'INVALID_CODE')
  })

  it('abandons a half-finished sign-in after 10 minutes', async () => {
    await setupAdmin()
    auth.logout()
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    c.advance(11 * 60_000)
    await expectCode(() => auth.verifyTotp({ code: currentCode() }), 'SESSION_EXPIRED')
    expect(auth.status().stage).toBe('signed_out')
  })

  it('locks and unlocks with the password; repeated failures sign out', async () => {
    await setupAdmin()
    auth.lock('idle')
    expect(auth.status().stage).toBe('locked')
    expect(auth.currentUser()).toBeNull()
    await expectCode(auth.unlock({ password: 'nope-nope-nope' }), 'INVALID_CREDENTIALS')
    expect((await auth.unlock({ password: ADMIN.password })).stage).toBe('signed_in')

    auth.lock()
    for (let i = 0; i < 4; i++) await expectCode(auth.unlock({ password: 'nope-nope-nope' }), 'INVALID_CREDENTIALS')
    await expectCode(auth.unlock({ password: 'nope-nope-nope' }), 'ACCOUNT_LOCKED')
    expect(auth.status().stage).toBe('signed_out')
  })

  it('forces a password change when required, and refuses reuse', async () => {
    await setupAdmin()
    t.db.update(users).set({ mustChangePassword: true }).run()
    auth.logout()
    c.advance(60_000)
    await auth.login({ email: 'admin@ci.org', password: ADMIN.password })
    auth.verifyTotp({ code: currentCode() })
    expect(auth.status().stage).toBe('password_change_required')
    await expectCode(auth.changePassword({ newPassword: ADMIN.password }), 'PASSWORD_REUSED')
    expect((await auth.changePassword({ newPassword: 'orchid-tuk-tuk-mekong-7' })).stage).toBe('signed_in')
  })

  it('requires current password and a code for a voluntary change', async () => {
    await setupAdmin()
    c.advance(60_000)
    await expectCode(auth.changePassword({ currentPassword: ADMIN.password, newPassword: 'orchid-tuk-tuk-mekong-7' }), 'INVALID_CODE')
    await expectCode(auth.changePassword({ currentPassword: 'wrong', newPassword: 'orchid-tuk-tuk-mekong-7', code: currentCode() }), 'INVALID_CREDENTIALS')
    await auth.changePassword({ currentPassword: ADMIN.password, newPassword: 'orchid-tuk-tuk-mekong-7', code: currentCode() })
    auth.logout()
    await expectCode(auth.login({ email: 'admin@ci.org', password: ADMIN.password }), 'INVALID_CREDENTIALS')
  })

  it('reveals a disabled account only after the correct password', async () => {
    await setupAdmin()
    auth.logout()
    t.db.update(users).set({ disabled: true }).run()
    await expectCode(auth.login({ email: 'admin@ci.org', password: 'wrong-password-xx' }), 'INVALID_CREDENTIALS')
    await expectCode(auth.login({ email: 'admin@ci.org', password: ADMIN.password }), 'ACCOUNT_DISABLED')
  })

  it('sends a user without an authenticator to enrollment after their password', async () => {
    await setupAdmin()
    auth.logout()
    t.db.insert(users).values({ email: 'keeper@ci.org', displayName: 'Keeper', passwordHash: await hashPassword('temp-pass-word-99'), role: 'storekeeper', mustChangePassword: true }).run()
    expect((await auth.login({ email: 'keeper@ci.org', password: 'temp-pass-word-99' })).stage).toBe('enrollment_required')
  })

  it('writes a valid audit trail of everything above', async () => {
    await setupAdmin()
    auth.lock()
    await auth.unlock({ password: ADMIN.password })
    auth.logout()
    await expectCode(auth.login({ email: 'nobody@ci.org', password: 'x' }), 'INVALID_CREDENTIALS')
    const actions = t.db.select({ a: auditLog.action }).from(auditLog).all().map((r) => r.a)
    expect(actions).toEqual(['auth.setup_admin', 'auth.totp_enrolled', 'auth.login', 'auth.lock', 'auth.unlock', 'auth.logout', 'auth.login_failed'])
    expect(verifyAuditChain(t.db).ok).toBe(true)
  })
})

describe('AuthService under parallel attempts', () => {
  it('does not let concurrent guesses bypass the lockout', async () => {
    const t = openTestDatabase()
    const c = clock()
    const auth = new AuthService({ db: t.db, totpKey: randomBytes(32), now: c.now })
    await auth.setupAdmin(ADMIN)
    auth.logout()
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => auth.login({ email: 'admin@ci.org', password: 'guess-guess-guess' }))
    )
    const codes = results.map((r) => (r.status === 'rejected' ? (r.reason as { code: string }).code : 'OK'))
    expect(codes.filter((x) => x === 'INVALID_CREDENTIALS')).toHaveLength(4)
    expect(codes.filter((x) => x === 'ACCOUNT_LOCKED')).toHaveLength(16)
    t.cleanup()
  })
})
