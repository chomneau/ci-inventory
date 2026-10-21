import { hkdfSync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/** OS-backed secret storage (Electron safeStorage in the app, a fake in tests). */
export interface SecretProtector {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export type DatabaseKeyErrorCode = 'ENCRYPTION_UNAVAILABLE' | 'KEY_MISSING' | 'KEY_UNREADABLE'

export class DatabaseKeyError extends Error {
  constructor(
    readonly code: DatabaseKeyErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DatabaseKeyError'
  }
}

export const DB_KEY_PATTERN = /^[0-9a-f]{64}$/

/**
 * Returns the 256-bit database key (hex). On first run a random key is created
 * and stored only in wrapped form (encrypted by the OS keychain / DPAPI / libsecret).
 * Fails closed: never stores a plaintext key and never replaces the key of an existing database.
 */
export function loadOrCreateDatabaseKey(opts: {
  keyFile: string
  dbFile: string
  protector: SecretProtector
}): { key: string; created: boolean } {
  const { keyFile, dbFile, protector } = opts
  if (!protector.isEncryptionAvailable()) {
    throw new DatabaseKeyError('ENCRYPTION_UNAVAILABLE', 'OS secure storage is not available')
  }

  if (existsSync(keyFile)) {
    let key: string
    try {
      key = protector.decryptString(readFileSync(keyFile))
    } catch {
      throw new DatabaseKeyError('KEY_UNREADABLE', 'Database key could not be unlocked')
    }
    if (!DB_KEY_PATTERN.test(key)) {
      throw new DatabaseKeyError('KEY_UNREADABLE', 'Database key is corrupt')
    }
    return { key, created: false }
  }

  if (existsSync(dbFile)) {
    throw new DatabaseKeyError('KEY_MISSING', 'Database exists but its key is missing')
  }

  const key = randomBytes(32).toString('hex')
  // 'wx' fails if the file appeared in the meantime rather than overwriting it.
  writeFileSync(keyFile, protector.encryptString(key), { mode: 0o600, flag: 'wx' })
  return { key, created: true }
}

/**
 * Derives an independent 256-bit key for one purpose (e.g. "totp-secrets"), so
 * the database key itself is never reused for anything else.
 */
export function deriveSubkey(dbKeyHex: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(dbKeyHex, 'hex'), Buffer.alloc(0), `ci-inventory:${purpose}:v1`, 32))
}
