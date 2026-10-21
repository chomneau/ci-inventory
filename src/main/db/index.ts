import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { BackupSummary } from '@shared/admin'
import { AppError } from '../ipc/errors'
import { recordAudit } from '../services/audit'
import { createBackup, inspectBackup, readBackup, writeRestoredDatabase, type BackupContents } from '../services/backup'
import { openDatabase, type Db, type OpenedDatabase } from './client'
import { deriveSubkey, loadOrCreateDatabaseKey, type SecretProtector } from './key'

let opened: OpenedDatabase | null = null
let dbKey: string | null = null

/** safeStorage, but treating Linux's plaintext fallback ("basic_text") as unavailable. */
const electronProtector: SecretProtector = {
  isEncryptionAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    !(process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())),
  encryptString: (plain) => safeStorage.encryptString(plain),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted)
}

const dataDir = () => join(app.getPath('userData'), 'data')
const dbFilePath = () => join(dataDir(), 'inventory.db')
const keyFilePath = () => join(dataDir(), 'db.key')
// Migrations ship inside the app (asar) next to package.json.
const migrationsFolder = () => join(app.getAppPath(), 'drizzle')

/** Opens the encrypted database. Must be called after `app` is ready. */
export function initDatabase(): void {
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 })
  const dbFile = dbFilePath()

  const { key, created } = loadOrCreateDatabaseKey({
    keyFile: keyFilePath(),
    dbFile,
    protector: electronProtector
  })
  dbKey = key
  opened = openDatabase(dbFile, key, migrationsFolder())
  // Owner-only, like the directory. SQLite gives the -wal/-shm files the same mode.
  chmodSync(dbFile, 0o600)
  if (created) {
    recordAudit(opened.db, { actorUserId: null, action: 'database.created' })
  }
  pruneSafetyCopies()
}

/** Keep only the newest restore safety copies (they are still encrypted, but take space). */
const KEEP_SAFETY_COPIES = 3
function pruneSafetyCopies(): void {
  const copies = readdirSync(dataDir())
    .filter((n) => n.startsWith('pre-restore-'))
    .sort()
    .reverse()
  for (const old of copies.slice(KEEP_SAFETY_COPIES)) rmSync(join(dataDir(), old), { recursive: true, force: true })
}

export function getDb(): Db {
  if (!opened) throw new Error('Database is not open')
  return opened.db
}

export function getDatabaseCipher(): string {
  if (!opened) throw new Error('Database is not open')
  return String(opened.sqlite.pragma('cipher', { simple: true }))
}

/** Purpose-specific key derived from the database key (see deriveSubkey). */
export function getSubkey(purpose: string): Buffer {
  if (!dbKey) throw new Error('Database is not open')
  return deriveSubkey(dbKey, purpose)
}

export function closeDatabase(): void {
  opened?.close()
  opened = null
  dbKey = null
}

// ---------------------------------------------------------------- backup & restore

/** Encrypted snapshot of the live database (see services/backup.ts). */
export function createBackupFile(password: string): Promise<Buffer> {
  if (!opened || !dbKey) throw new Error('Database is not open')
  return createBackup(opened.sqlite, dbKey, password, app.getVersion())
}

/** A decrypted, validated backup waiting for the admin to confirm. Memory only, short-lived. */
let pendingRestore: { token: string; contents: BackupContents; expiresAt: number } | null = null
const RESTORE_TTL_MS = 10 * 60_000

export async function prepareRestore(file: Buffer, password: string): Promise<BackupSummary> {
  const contents = await readBackup(file, password)
  const counts = inspectBackup(contents, migrationsFolder())
  const token = randomUUID()
  pendingRestore = { token, contents, expiresAt: Date.now() + RESTORE_TTL_MS }
  return { token, createdAt: contents.meta.createdAt, appVersion: contents.meta.appVersion, counts }
}

export function cancelRestore(): void {
  pendingRestore = null
}

/**
 * Replaces the live database with the pending backup. The new database is fully
 * built and verified first; the current one is kept as a safety copy in
 * data/pre-restore-<time>/ (still encrypted, with its wrapped key). The caller
 * must relaunch the app afterwards.
 */
export function applyRestore(token: string, restoredBy: string, beforeSwap: () => void): { safetyCopy: string } {
  const pending = pendingRestore
  if (!pending || pending.token !== token || Date.now() > pending.expiresAt) throw new AppError('RESTORE_EXPIRED')
  if (!opened) throw new Error('Database is not open')

  const live = dbFilePath()
  const staged = join(dataDir(), 'inventory.restore.db')
  for (const f of [staged, `${staged}-wal`, `${staged}-shm`]) rmSync(f, { force: true })
  try {
    writeRestoredDatabase(pending.contents, staged, migrationsFolder())
    // Record the restore in the restored database's own audit trail.
    const restored = openDatabase(staged, pending.contents.meta.dbKey, migrationsFolder())
    recordAudit(restored.db, {
      actorUserId: null,
      action: 'backup.restored',
      details: { restoredBy, backupCreatedAt: new Date(pending.contents.meta.createdAt), backupAppVersion: pending.contents.meta.appVersion }
    })
    restored.close()
  } catch (err) {
    for (const f of [staged, `${staged}-wal`, `${staged}-shm`]) rmSync(f, { force: true })
    throw err
  }

  // Point of no return. Let the caller end the session while the live database is still open
  // (nothing may touch it after it closes), then keep a safety copy and swap the files.
  recordAudit(opened.db, { actorUserId: null, action: 'backup.replaced_by_restore', details: { restoredBy } })
  beforeSwap()
  opened.sqlite.pragma('wal_checkpoint(TRUNCATE)')
  closeDatabase()
  const safetyDir = join(dataDir(), `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(safetyDir, { mode: 0o700 })
  copyFileSync(live, join(safetyDir, 'inventory.db'))
  copyFileSync(keyFilePath(), join(safetyDir, 'db.key'))

  for (const f of [live, `${live}-wal`, `${live}-shm`]) rmSync(f, { force: true })
  renameSync(staged, live)
  chmodSync(live, 0o600)
  const keyTmp = `${keyFilePath()}.tmp`
  writeFileSync(keyTmp, electronProtector.encryptString(pending.contents.meta.dbKey), { mode: 0o600 })
  renameSync(keyTmp, keyFilePath())
  pendingRestore = null
  return { safetyCopy: safetyDir }
}
