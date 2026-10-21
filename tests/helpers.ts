import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDatabase, type OpenedDatabase } from '../src/main/db/client'
import type { SecretProtector } from '../src/main/db/key'

export const MIGRATIONS = path.resolve('drizzle')

export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-inventory-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export function randomKey(): string {
  return randomBytes(32).toString('hex')
}

export function openTestDatabase(): OpenedDatabase & { file: string; key: string; cleanup: () => void } {
  const { dir, cleanup } = tempDir()
  const file = path.join(dir, 'test.db')
  const key = randomKey()
  const opened = openDatabase(file, key, MIGRATIONS)
  return {
    ...opened,
    file,
    key,
    cleanup: () => {
      opened.close()
      cleanup()
    }
  }
}

/** Reversible stand-in for safeStorage (XOR), so tests can tell wrapped from plain. */
export function fakeProtector(available = true): SecretProtector {
  const xor = (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a))
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => xor(Buffer.from(s, 'utf8')),
    decryptString: (b) => xor(b).toString('utf8')
  }
}
