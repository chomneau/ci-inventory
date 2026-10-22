import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PublicUser } from '@shared/auth'
import { passwordIssues } from '@shared/auth'
import { AuthService } from '../src/main/auth/auth-service'
import { timeStep, totpAt } from '../src/main/auth/totp'
import { userTotp, users } from '../src/main/db/schema'
import { getAppSettings, updateAppSettings } from '../src/main/services/app-settings'
import { listAudit, recentSignInActivity } from '../src/main/services/audit-query'
import { generateTemporaryPassword, UserAdminService } from '../src/main/services/users'
import { openTestDatabase } from './helpers'

const ADMIN = { email: 'admin@ci.org', displayName: 'Dara Admin', password: 'river-mango-lantern-42' }

function clock(start = 1_800_000_000_000) {
  let t = start
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) }
}

async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === 'function' ? Promise.resolve().then(p) : p)
    return 'NO_ERROR'
  } catch (e) {
    return (e as { code: string }).code
  }
}

describe('admin features', () => {
  let t: ReturnType<typeof openTestDatabase>
  let c: ReturnType<typeof clock>
  let auth: AuthService
  let admin: PublicUser
  let secret: string
  let svc: UserAdminService
  const code = (offset = 0) => totpAt(secret, timeStep(c.now()) + offset)

  beforeEach(async () => {
    t = openTestDatabase()
    c = clock()
    auth = new AuthService({ db: t.db, totpKey: randomBytes(32), now: c.now })
    await auth.setupAdmin(ADMIN)
    secret = (await auth.beginEnrollment()).manualKey.replace(/ /g, '')
    auth.confirmEnrollment({ code: code() })
    auth.acknowledgeRecoveryCodes()
    admin = auth.currentUser()!
    svc = new UserAdminService(t.db, c.now)
  })
  afterEach(() => t.cleanup())

  describe('temporary passwords', () => {
    it('are strong, readable and unique', () => {
      const set = new Set(Array.from({ length: 50 }, generateTemporaryPassword))
      expect(set.size).toBe(50)
      for (const pw of set) {
        expect(pw).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$/)
        expect(passwordIssues(pw)).toEqual([])
      }
    })
  })

  describe('user administration', () => {
    it('creates a user who must link a phone and change the temporary password', async () => {
      const temp = await svc.create(admin, { email: 'keeper@ci.org', displayName: 'Keeper', role: 'storekeeper' })
      auth.logout()
      expect((await auth.login({ email: 'keeper@ci.org', password: temp.temporaryPassword })).stage).toBe('enrollment_required')
      const keeper = svc.list().find((u) => u.email === 'keeper@ci.org')!
      expect(keeper).toMatchObject({ role: 'storekeeper', mustChangePassword: true, authenticatorLinked: false, disabled: false })
      expect(await codeOf(svc.create(admin, { email: 'keeper@ci.org', displayName: 'X', role: 'viewer' }))).toBe('DUPLICATE')
    })

    it('never leaves the system without an active administrator', async () => {
      expect(await codeOf(() => svc.update(admin, { id: admin.id, displayName: 'Me', role: 'viewer' }))).toBe('CANNOT_CHANGE_SELF')
      expect(await codeOf(() => svc.setDisabled(admin, admin.id, true))).toBe('CANNOT_CHANGE_SELF')
      expect(await codeOf(svc.resetPassword(admin, admin.id))).toBe('CANNOT_CHANGE_SELF')

      const other = await svc.create(admin, { email: 'a2@ci.org', displayName: 'Second admin', role: 'admin' })
      const otherActor = { ...admin, id: other.userId }
      // The second admin may demote the first, but then nobody may demote/disable the last one.
      svc.update(otherActor, { id: admin.id, displayName: admin.displayName, role: 'storekeeper' })
      expect(await codeOf(() => svc.setDisabled(admin, other.userId, true))).toBe('LAST_ADMIN')
      expect(await codeOf(() => svc.update(admin, { id: other.userId, displayName: 'x', role: 'viewer' }))).toBe('LAST_ADMIN')
    })

    it('disables, unlocks, resets password and authenticator', async () => {
      const temp = await svc.create(admin, { email: 'v@ci.org', displayName: 'Viewer', role: 'viewer' })
      svc.setDisabled(admin, temp.userId, true)
      auth.logout()
      expect(await codeOf(auth.login({ email: 'v@ci.org', password: temp.temporaryPassword }))).toBe('ACCOUNT_DISABLED')

      t.db.update(users).set({ disabled: false, failedLoginCount: 9, lockedUntil: new Date(c.now().getTime() + 3_600_000) }).run()
      expect(svc.list().find((u) => u.id === temp.userId)?.locked).toBe(true)
      svc.unlock(admin, temp.userId)
      expect(svc.list().find((u) => u.id === temp.userId)?.locked).toBe(false)

      const fresh = await svc.resetPassword(admin, temp.userId)
      expect(fresh.temporaryPassword).not.toBe(temp.temporaryPassword)
      expect(await codeOf(auth.login({ email: 'v@ci.org', password: temp.temporaryPassword }))).toBe('INVALID_CREDENTIALS')

      // Give the viewer an authenticator, then reset it: next sign-in goes back to enrollment.
      t.db.insert(userTotp).values({ userId: temp.userId, secretEncrypted: 'x', enabledAt: new Date() }).run()
      svc.resetAuthenticator(admin, temp.userId)
      expect((await auth.login({ email: 'v@ci.org', password: fresh.temporaryPassword })).stage).toBe('enrollment_required')
    })
  })

  describe('step-up', () => {
    it('is required for admin actions and expires after 5 minutes or on lock', () => {
      expect(() => auth.assertStepUp()).toThrow(expect.objectContaining({ code: 'STEP_UP_REQUIRED' }))
      c.advance(30_000)
      expect(() => auth.stepUp({ code: '000000' })).toThrow(expect.objectContaining({ code: 'INVALID_CODE' }))
      auth.stepUp({ code: code() })
      expect(() => auth.assertStepUp()).not.toThrow()
      expect(() => auth.stepUp({ code: code() })).toThrow(expect.objectContaining({ code: 'INVALID_CODE' })) // replay
      c.advance(5 * 60_000 + 1)
      expect(() => auth.assertStepUp()).toThrow(expect.objectContaining({ code: 'STEP_UP_REQUIRED' }))
      c.advance(30_000)
      auth.stepUp({ code: code() })
      auth.lock()
      expect(() => auth.assertStepUp()).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }))
    })
  })

  it('regenerates recovery codes only with an authenticator code', async () => {
    c.advance(30_000)
    expect(await codeOf(() => auth.regenerateRecoveryCodes({ code: '123456' }))).toBe('INVALID_CODE')
    const codes = auth.regenerateRecoveryCodes({ code: code() })
    expect(codes).toHaveLength(10)
    auth.logout()
    await auth.login({ email: ADMIN.email, password: ADMIN.password })
    expect(auth.useRecoveryCode({ code: codes[0]! }).stage).toBe('signed_in')
  })

  it('persists unknown-email lockout across restarts', async () => {
    auth.logout()
    for (let i = 0; i < 5; i++) await codeOf(auth.login({ email: 'ghost@ci.org', password: 'nope-nope-nope' }))
    const restarted = new AuthService({ db: t.db, totpKey: randomBytes(32), now: c.now })
    expect(await codeOf(restarted.login({ email: 'ghost@ci.org', password: 'nope-nope-nope' }))).toBe('ACCOUNT_LOCKED')
  })

  it('reads and updates settings with an audit entry', () => {
    expect(getAppSettings(t.db)).toEqual({ idleLockMinutes: 10, officeName: 'CI Cambodia', backupReminderDays: 7, updatesEnabled: true, requireStaffConfirmation: true, lastBackupAt: null })
    const next = updateAppSettings(t.db, admin, { idleLockMinutes: 15, officeName: 'CI Cambodia — Phnom Penh' })
    expect(next).toMatchObject({ idleLockMinutes: 15, officeName: 'CI Cambodia — Phnom Penh' })
    expect(listAudit(t.db, { search: 'settings.update' })[0]?.details).toMatchObject({ idleLockMinutes: { from: 10, to: 15 } })
  })

  it('lists audit entries with actor names and a user’s own sign-in activity', () => {
    const entries = listAudit(t.db)
    expect(entries[0]).toMatchObject({ action: 'auth.login', actorName: 'Dara Admin' })
    expect(listAudit(t.db, { search: 'Dara' }).length).toBe(entries.length)
    expect(listAudit(t.db, { search: '%' })).toEqual([])
    expect(recentSignInActivity(t.db, admin.id).map((e) => e.action)).toContain('auth.login')
  })
})
