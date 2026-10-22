import { z } from 'zod'
import type { PublicUser } from '@shared/auth'
import type { AppSettings, appSettingsUpdate } from '@shared/admin'
import type { Db } from '../db/client'
import { settings } from '../db/schema'
import { recordAudit } from './audit'
import { getSetting } from './settings'

const KEYS = {
  idleLockMinutes: 'security.idleLockMinutes',
  officeName: 'org.officeName',
  backupReminderDays: 'backup.reminderDays',
  updatesEnabled: 'updates.enabled',
  requireStaffConfirmation: 'stock.requireStaffConfirmation',
  lastBackupAt: 'backup.lastAt'
} as const

export function getAppSettings(db: Db): AppSettings {
  return {
    idleLockMinutes: getSetting(db, KEYS.idleLockMinutes, z.number().int().min(1).max(240), 10),
    officeName: getSetting(db, KEYS.officeName, z.string().min(1).max(120), 'CI Cambodia'),
    backupReminderDays: getSetting(db, KEYS.backupReminderDays, z.number().int().min(1).max(90), 7),
    updatesEnabled: getSetting(db, KEYS.updatesEnabled, z.boolean(), true),
    requireStaffConfirmation: getSetting(db, KEYS.requireStaffConfirmation, z.boolean(), true),
    lastBackupAt: getSetting(db, KEYS.lastBackupAt, z.number().int().nullable(), null)
  }
}

export function updateAppSettings(db: Db, actor: PublicUser, input: z.output<typeof appSettingsUpdate>): AppSettings {
  db.transaction((tx) => {
    const before = getAppSettings(db)
    const changed: Record<string, { from: unknown; to: unknown }> = {}
    for (const [field, value] of Object.entries(input) as [keyof typeof input, unknown][]) {
      if (value === undefined || before[field] === value) continue
      writeSetting(tx, KEYS[field], value)
      changed[field] = { from: before[field], to: value }
    }
    if (Object.keys(changed).length) recordAudit(tx, { actorUserId: actor.id, action: 'settings.update', details: changed })
  })
  return getAppSettings(db)
}

export function markBackupDone(db: Db, at: Date): void {
  writeSetting(db, KEYS.lastBackupAt, at.getTime())
}

function writeSetting(db: Pick<Db, 'insert'>, key: string, value: unknown): void {
  const json = JSON.stringify(value)
  db.insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: new Date() } }).run()
}
