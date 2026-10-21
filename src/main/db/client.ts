// 'better-sqlite3' is an npm alias for better-sqlite3-multiple-ciphers (SQLCipher build); see package.json.
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DB_KEY_PATTERN } from './key'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

export interface OpenedDatabase {
  db: Db
  sqlite: Database.Database
  close(): void
}

/**
 * Opens (or creates) the SQLCipher-encrypted database, verifies the key and
 * applies pending migrations. Throws if the key is wrong or the file is not ours.
 */
export function openDatabase(file: string, keyHex: string, migrationsFolder: string): OpenedDatabase {
  // The key is interpolated into a PRAGMA, so only a strict hex string is accepted.
  if (!DB_KEY_PATTERN.test(keyHex)) throw new Error('Invalid database key format')

  const sqlite = new Database(file)
  try {
    // Fail closed if a plain (unencrypted) SQLite build was ever swapped in.
    if (sqlite.pragma('cipher', { simple: true }) == null) {
      throw new Error('SQLite build has no encryption support')
    }
    sqlite.pragma(`cipher = 'sqlcipher'`)
    sqlite.pragma('legacy = 4')
    sqlite.pragma(`key = "x'${keyHex}'"`)
    // Any read fails with "file is not a database" when the key is wrong.
    sqlite.prepare('SELECT count(*) FROM sqlite_master').get()

    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('secure_delete = ON')
    sqlite.pragma('trusted_schema = OFF')

    const db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder })
    return { db, sqlite, close: () => sqlite.close() }
  } catch (err) {
    sqlite.close()
    throw err
  }
}
