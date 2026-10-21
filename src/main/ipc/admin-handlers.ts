import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, passwordIssues, type Role } from '@shared/auth'
import { appSettingsUpdate, auditListQuery, userCreate, userUpdate } from '@shared/admin'
import { Channels } from '@shared/channels'
import type { AuthService } from '../auth/auth-service'
import type { Db } from '../db/client'
import { applyRestore, cancelRestore, createBackupFile, prepareRestore } from '../db'
import { chooseOpenPath, chooseSavePath } from '../dialogs'
import { getAppSettings, markBackupDone, updateAppSettings } from '../services/app-settings'
import { recordAudit, verifyAuditChain } from '../services/audit'
import { auditCsv, listAudit, recentSignInActivity } from '../services/audit-query'
import type { UserAdminService } from '../services/users'
import { checkForUpdates, getUpdateStatus, installDownloadedUpdate, openReleasePage } from '../updater'
import { AppError } from './errors'
import { handle } from './router'

const ADMIN: readonly Role[] = ['admin']
const id = z.object({ id: z.number().int().positive() })
const code = z.object({
  code: z
    .string()
    .transform((s) => s.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/))
})
const none = z.undefined()
const backupPassword = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
const MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024

export function registerAdminHandlers(db: Db, auth: AuthService, users: UserAdminService): void {
  /** Sensitive admin actions need a recent authenticator re-confirmation. */
  const stepUp = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A): R => {
    auth.assertStepUp()
    return fn(...args)
  }

  // ---- self-service security (any signed-in user)
  handle(Channels.authStepUp, code, (input) => auth.stepUp(input))
  handle(Channels.authRegenerateRecoveryCodes, code, (input) => auth.regenerateRecoveryCodes(input))
  handle(Channels.authActivity, none, (_i, { user }) => recentSignInActivity(db, user!.id))

  // ---- users (admins, with step-up for every change)
  handle(Channels.usersList, none, () => users.list(), ADMIN)
  handle(Channels.usersCreate, userCreate, stepUp((input, { user }) => users.create(user!, input)), ADMIN)
  handle(Channels.usersUpdate, userUpdate, stepUp((input, { user }) => users.update(user!, input)), ADMIN)
  handle(
    Channels.usersSetDisabled,
    id.extend({ disabled: z.boolean() }),
    stepUp((input, { user }) => users.setDisabled(user!, input.id, input.disabled)),
    ADMIN
  )
  handle(Channels.usersUnlock, id, stepUp((input, { user }) => users.unlock(user!, input.id)), ADMIN)
  handle(Channels.usersResetPassword, id, stepUp((input, { user }) => users.resetPassword(user!, input.id)), ADMIN)
  handle(Channels.usersResetAuthenticator, id, stepUp((input, { user }) => users.resetAuthenticator(user!, input.id)), ADMIN)

  // ---- settings (everyone reads; admins change, with step-up since it includes the idle-lock policy)
  handle(Channels.settingsGet, none, () => getAppSettings(db))
  handle(Channels.settingsUpdate, appSettingsUpdate, stepUp((input, { user }) => updateAppSettings(db, user!, input)), ADMIN)

  // ---- backup & restore (admins, step-up)
  handle(
    Channels.backupCreate,
    backupPassword,
    stepUp(async (input, { user, event }) => {
      const issues = passwordIssues(input.password)
      if (issues.length) throw new AppError('WEAK_PASSWORD', { issues: issues.join(',') })
      const stamp = new Date().toISOString().slice(0, 10)
      const filePath = await chooseSavePath(event.sender, {
        title: 'Save encrypted backup',
        defaultPath: `ci-inventory-backup-${stamp}.cibackup`,
        filters: [{ name: 'CI Inventory backup', extensions: ['cibackup'] }]
      })
      if (!filePath) return { saved: false }
      const data = await createBackupFile(input.password)
      await writeFile(filePath, data, { mode: 0o600 })
      const fileName = path.basename(filePath)
      const now = new Date()
      db.transaction((tx) => {
        recordAudit(tx, { actorUserId: user!.id, action: 'backup.create', details: { fileName, bytes: data.length } })
      })
      markBackupDone(db, now)
      return { saved: true, fileName }
    }),
    ADMIN
  )

  handle(
    Channels.backupInspect,
    backupPassword,
    async (input, { user, event }) => {
      const filePath = await chooseOpenPath(event.sender, {
        title: 'Choose a backup to restore',
        properties: ['openFile'],
        filters: [{ name: 'CI Inventory backup', extensions: ['cibackup'] }]
      })
      if (!filePath) return null
      if ((await stat(filePath)).size > MAX_BACKUP_BYTES) throw new AppError('BACKUP_INVALID')
      try {
        return await prepareRestore(await readFile(filePath), input.password)
      } catch (err) {
        if (err instanceof AppError) {
          recordAudit(db, { actorUserId: user!.id, action: 'backup.restore_rejected', details: { reason: err.code } })
        }
        throw err
      }
    },
    ADMIN
  )

  handle(
    Channels.backupApply,
    z.object({ token: z.string().uuid() }),
    stepUp((input, { user }) => {
      // Sign out before the live database closes, so no later event (window close, idle lock) writes to it.
      applyRestore(input.token, user!.email, () => auth.logout())
      // Restart onto the restored data once this reply has been delivered; everyone signs in again.
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 400)
    }),
    ADMIN
  )
  handle(Channels.backupCancel, none, () => cancelRestore(), ADMIN)

  // ---- updates (status/install for everyone signed in; manual check for admins)
  handle(Channels.updatesStatus, none, () => getUpdateStatus())
  handle(Channels.updatesCheck, none, () => checkForUpdates(), ADMIN)
  handle(Channels.updatesInstall, none, () => installDownloadedUpdate())
  handle(Channels.updatesOpenRelease, none, () => openReleasePage())

  // ---- audit log (admins)
  handle(Channels.auditList, auditListQuery.partial().optional(), (input) => listAudit(db, input ?? {}), ADMIN)
  handle(Channels.auditVerify, none, () => verifyAuditChain(db), ADMIN)
  handle(
    Channels.auditExport,
    none,
    async (_i, { user, event }) => {
      const stamp = new Date().toISOString().slice(0, 10)
      const filePath = await chooseSavePath(event.sender, {
        title: 'Export audit log',
        defaultPath: `ci-inventory-audit-${stamp}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (!filePath) return { saved: false }
      await writeFile(filePath, '﻿' + auditCsv(db), 'utf8')
      const fileName = path.basename(filePath)
      recordAudit(db, { actorUserId: user!.id, action: 'export.csv', details: { kind: 'audit', fileName } })
      return { saved: true, fileName }
    },
    ADMIN
  )
}
