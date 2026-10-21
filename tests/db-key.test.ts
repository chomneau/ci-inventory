import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseKeyError, loadOrCreateDatabaseKey } from '../src/main/db/key'
import { fakeProtector, tempDir } from './helpers'

describe('loadOrCreateDatabaseKey', () => {
  let dir: string
  let cleanup: () => void
  let keyFile: string
  let dbFile: string

  beforeEach(() => {
    ;({ dir, cleanup } = tempDir())
    keyFile = path.join(dir, 'db.key')
    dbFile = path.join(dir, 'inventory.db')
  })
  afterEach(() => cleanup())

  it('creates a random 256-bit key once, stores it wrapped, and reloads the same key', () => {
    const first = loadOrCreateDatabaseKey({ keyFile, dbFile, protector: fakeProtector() })
    expect(first.created).toBe(true)
    expect(first.key).toMatch(/^[0-9a-f]{64}$/)
    expect(readFileSync(keyFile).toString('utf8')).not.toContain(first.key)

    const second = loadOrCreateDatabaseKey({ keyFile, dbFile, protector: fakeProtector() })
    expect(second).toEqual({ key: first.key, created: false })
  })

  it('refuses to run without OS secure storage', () => {
    expect(() => loadOrCreateDatabaseKey({ keyFile, dbFile, protector: fakeProtector(false) })).toThrow(
      expect.objectContaining({ code: 'ENCRYPTION_UNAVAILABLE' })
    )
  })

  it('never creates a new key for an existing database', () => {
    writeFileSync(dbFile, 'existing')
    expect(() => loadOrCreateDatabaseKey({ keyFile, dbFile, protector: fakeProtector() })).toThrow(
      expect.objectContaining({ code: 'KEY_MISSING' })
    )
  })

  it('rejects a corrupted key file', () => {
    writeFileSync(keyFile, 'garbage')
    const err = (() => {
      try {
        loadOrCreateDatabaseKey({ keyFile, dbFile, protector: fakeProtector() })
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(DatabaseKeyError)
    expect((err as DatabaseKeyError).code).toBe('KEY_UNREADABLE')
  })
})
