import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { hashRaw } from '@node-rs/argon2'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { z } from 'zod'
import { openDatabase } from '../db/client'
import { DB_KEY_PATTERN } from '../db/key'
import * as schema from '../db/schema'
import { AppError } from '../ipc/errors'
import { verifyAuditChain } from './audit'

/*
 * Backup file layout (all integers big-endian):
 *   MAGIC | u32 headerLength | header JSON | 16-byte GCM tag | ciphertext
 * header = { format, kdf: argon2id params + salt, iv }   (authenticated as AAD, not secret)
 * plaintext = u32 metaLength | meta JSON | SQLite database image
 * meta carries the database key so authenticator secrets (sealed with a key derived
 * from it) still open after restoring onto another computer.
 */
const MAGIC = Buffer.from('CI-INVENTORY-BACKUP\n', 'ascii')
const KDF = { memoryCost: 65536, timeCost: 3, parallelism: 4 } as const
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1')

const headerSchema = z.object({
  format: z.literal(1),
  kdf: z.object({
    alg: z.literal('argon2id'),
    // Upper bounds stop a crafted file from forcing huge memory/time on open.
    memoryCost: z.number().int().min(19456).max(262144),
    timeCost: z.number().int().min(1).max(10),
    parallelism: z.number().int().min(1).max(8),
    salt: z.string()
  }),
  iv: z.string()
})

const metaSchema = z.object({
  format: z.literal(1),
  createdAt: z.number().int(),
  appVersion: z.string().max(50),
  dbKey: z.string().regex(DB_KEY_PATTERN),
  migrations: z.number().int().min(0),
  counts: z.object({ users: z.number(), items: z.number(), movements: z.number(), auditEntries: z.number() })
})
export type BackupMeta = z.infer<typeof metaSchema>
export interface BackupContents {
  meta: BackupMeta
  database: Buffer
}

function deriveKey(password: string, salt: Buffer, params: { memoryCost: number; timeCost: number; parallelism: number }): Promise<Buffer> {
  return hashRaw(password, { algorithm: 2 /* Argon2id */, ...params, outputLen: 32, salt })
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

function counts(db: Database.Database): BackupMeta['counts'] {
  const n = (table: string) => Number(db.prepare(`select count(*) from ${table}`).pluck().get())
  return { users: n('users'), items: n('items'), movements: n('stock_movements'), auditEntries: n('audit_log') }
}

export function migrationCount(migrationsFolder: string): number {
  return readMigrationFiles({ migrationsFolder }).length
}

/** Snapshot of the live database, encrypted with a key derived from `password`. */
export async function createBackup(
  sqlite: Database.Database,
  dbKey: string,
  password: string,
  appVersion: string,
  now: Date = new Date()
): Promise<Buffer> {
  // serialize() returns decrypted pages in memory only; they are re-encrypted below and never touch disk.
  const database = Buffer.from(sqlite.serialize())
  database[18] = 1 // file-format bytes: WAL (2) → legacy (1), so the image opens as an in-memory database
  database[19] = 1
  const meta: BackupMeta = {
    format: 1,
    createdAt: now.getTime(),
    appVersion,
    dbKey,
    migrations: Number(sqlite.prepare('select count(*) from __drizzle_migrations').pluck().get()),
    counts: counts(sqlite)
  }
  const metaJson = Buffer.from(JSON.stringify(meta), 'utf8')
  const plaintext = Buffer.concat([u32(metaJson.length), metaJson, database])

  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const header = Buffer.from(
    JSON.stringify({ format: 1, kdf: { alg: 'argon2id', ...KDF, salt: salt.toString('base64') }, iv: iv.toString('base64') }),
    'utf8'
  )
  const key = await deriveKey(password, salt, KDF)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.concat([MAGIC, header]))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  // Best-effort wipe of plaintext copies we own.
  plaintext.fill(0)
  database.fill(0)
  key.fill(0)
  return Buffer.concat([MAGIC, u32(header.length), header, tag, ciphertext])
}

/** Decrypts and parses a backup file. Wrong password and tampering are indistinguishable by design. */
export async function readBackup(file: Buffer, password: string): Promise<BackupContents> {
  const invalid = () => new AppError('BACKUP_INVALID')
  if (file.length < MAGIC.length + 4 || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw invalid()
  const headerLength = file.readUInt32BE(MAGIC.length)
  if (headerLength > 4096) throw invalid()
  const headerStart = MAGIC.length + 4
  const headerBytes = file.subarray(headerStart, headerStart + headerLength)
  let header: z.infer<typeof headerSchema>
  try {
    header = headerSchema.parse(JSON.parse(headerBytes.toString('utf8')))
  } catch {
    throw invalid()
  }
  const salt = Buffer.from(header.kdf.salt, 'base64')
  const iv = Buffer.from(header.iv, 'base64')
  if (salt.length !== 16 || iv.length !== 12) throw invalid()
  const tagStart = headerStart + headerLength
  const tag = file.subarray(tagStart, tagStart + 16)
  const ciphertext = file.subarray(tagStart + 16)
  if (tag.length !== 16 || ciphertext.length === 0) throw invalid()

  const key = await deriveKey(password, salt, header.kdf)
  let plaintext: Buffer
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.concat([MAGIC, headerBytes]))
    decipher.setAuthTag(tag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new AppError('BACKUP_PASSWORD')
  } finally {
    key.fill(0)
  }

  const metaLength = plaintext.readUInt32BE(0)
  let meta: BackupMeta
  try {
    meta = metaSchema.parse(JSON.parse(plaintext.subarray(4, 4 + metaLength).toString('utf8')))
  } catch {
    throw invalid()
  }
  const database = plaintext.subarray(4 + metaLength)
  if (!database.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) throw invalid()
  return { meta, database }
}

/**
 * Validates a decrypted backup without touching live data: version, SQLite
 * integrity, and the audit hash chain. Returns the record counts.
 */
export function inspectBackup(contents: BackupContents, migrationsFolder: string): BackupMeta['counts'] {
  if (contents.meta.migrations > migrationCount(migrationsFolder)) throw new AppError('BACKUP_TOO_NEW')
  const mem = openImage(contents.database)
  try {
    if (mem.pragma('integrity_check', { simple: true }) !== 'ok') throw new AppError('BACKUP_CORRUPT')
    const db = drizzle(mem, { schema })
    migrate(db, { migrationsFolder })
    if (!verifyAuditChain(db).ok) throw new AppError('BACKUP_TAMPERED')
    return counts(mem)
  } finally {
    mem.close()
  }
}

/**
 * Builds a new encrypted database at `targetFile` (which must not exist) from the
 * backup: fresh schema via migrations, then a row-by-row copy. No plaintext is
 * ever written to disk. Throws if the result fails any integrity check.
 */
export function writeRestoredDatabase(contents: BackupContents, targetFile: string, migrationsFolder: string): void {
  const mem = openImage(contents.database)
  const target = openDatabase(targetFile, contents.meta.dbKey, migrationsFolder)
  try {
    migrate(drizzle(mem, { schema }), { migrationsFolder })
    const tables = mem
      .prepare(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> '__drizzle_migrations'`)
      .pluck()
      .all() as string[]

    target.sqlite.pragma('foreign_keys = OFF')
    target.sqlite.transaction(() => {
      for (const table of tables) {
        if (!/^[a-z_]+$/.test(table)) throw new AppError('BACKUP_INVALID')
        const cols = (mem.pragma(`table_info("${table}")`) as { name: string }[]).map((c) => `"${c.name}"`)
        const insert = target.sqlite.prepare(`insert into "${table}" (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`)
        for (const row of mem.prepare(`select ${cols.join(', ')} from "${table}"`).raw().iterate()) insert.run(row as unknown[])
      }
      target.sqlite.exec('delete from sqlite_sequence')
      const seq = target.sqlite.prepare('insert into sqlite_sequence (name, seq) values (?, ?)')
      for (const row of mem.prepare('select name, seq from sqlite_sequence').raw().iterate()) seq.run(row as unknown[])
    })()
    target.sqlite.pragma('foreign_keys = ON')

    if ((target.sqlite.pragma('foreign_key_check') as unknown[]).length > 0) throw new AppError('BACKUP_CORRUPT')
    if (target.sqlite.pragma('integrity_check', { simple: true }) !== 'ok') throw new AppError('BACKUP_CORRUPT')
    if (!verifyAuditChain(target.db).ok) throw new AppError('BACKUP_TAMPERED')
  } finally {
    target.close()
    mem.close()
  }
}

function openImage(image: Buffer): Database.Database {
  try {
    return new Database(image)
  } catch {
    throw new AppError('BACKUP_CORRUPT')
  }
}
