import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { items, users } from '../src/main/db/schema'
import { recordAudit, verifyAuditChain } from '../src/main/services/audit'
import { createBackup, inspectBackup, readBackup, writeRestoredDatabase } from '../src/main/services/backup'
import { InventoryService } from '../src/main/services/inventory'
import { MIGRATIONS, openTestDatabase, tempDir } from './helpers'

const PW = 'backup-passphrase-2026'

describe('encrypted backup & restore', () => {
  let t: ReturnType<typeof openTestDatabase>
  let out: ReturnType<typeof tempDir>

  beforeEach(() => {
    t = openTestDatabase()
    out = tempDir()
    const u = t.db.insert(users).values({ email: 'a@ci.org', displayName: 'A', passwordHash: 'h', role: 'admin' }).returning().get()
    const actor = { id: u.id, email: u.email, displayName: u.displayName, role: u.role }
    const inv = new InventoryService(t.db)
    const loc = inv.createLocation(actor, { name: 'Store' })
    const item = inv.createItem(actor, { sku: 'SECRET-SKU', nameEn: 'Secret pen', unit: 'pcs', minStock: 1, unitCostCents: 5, defaultLocationId: loc.id, openingQuantity: 9 })
    inv.setItemPhoto(actor, item.id, { image: Buffer.from('jpeg-bytes'), thumbnail: Buffer.from('thumb') })
    recordAudit(t.db, { actorUserId: u.id, action: 'test.event' })
  })
  afterEach(() => {
    t.cleanup()
    out.cleanup()
  })

  it('round-trips everything into a new encrypted database (with the original key)', async () => {
    const file = await createBackup(t.sqlite, t.key, PW, '0.1.0')
    expect(file.includes('SECRET-SKU')).toBe(false)
    expect(file.includes(t.key)).toBe(false)

    const contents = await readBackup(file, PW)
    expect(contents.meta).toMatchObject({ appVersion: '0.1.0', dbKey: t.key, counts: { users: 1, items: 1, movements: 1 } })
    expect(inspectBackup(contents, MIGRATIONS)).toMatchObject({ users: 1, items: 1, movements: 1 })

    const target = path.join(out.dir, 'restored.db')
    writeRestoredDatabase(contents, target, MIGRATIONS)
    expect(readFileSync(target).includes('SECRET-SKU')).toBe(false)

    const restored = openDatabase(target, contents.meta.dbKey, MIGRATIONS)
    expect(restored.db.select().from(items).all()[0]).toMatchObject({ sku: 'SECRET-SKU' })
    const inv = new InventoryService(restored.db)
    const item = inv.listItems()[0]!
    expect(item.onHand).toBe(9)
    expect(inv.getItemPhoto(item.id, 'image')?.toString()).toBe('jpeg-bytes')
    expect(verifyAuditChain(restored.db)).toEqual({ ok: true, entries: verifyAuditChain(t.db).ok ? (verifyAuditChain(t.db) as { entries: number }).entries : -1 })
    // Append-only guards and autoincrement state survive.
    expect(() => restored.sqlite.exec('delete from audit_log')).toThrow(/append-only/)
    expect(restored.sqlite.prepare(`select seq from sqlite_sequence where name = 'audit_log'`).pluck().get()).toBe(
      t.sqlite.prepare(`select seq from sqlite_sequence where name = 'audit_log'`).pluck().get()
    )
    restored.close()
  })

  it('rejects a wrong password and any tampering identically', async () => {
    const file = await createBackup(t.sqlite, t.key, PW, '0.1.0')
    await expect(readBackup(file, 'wrong-password-xx')).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
    const flipped = Buffer.from(file)
    flipped[flipped.length - 10]! ^= 0xff
    await expect(readBackup(flipped, PW)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
    // Header is authenticated too: changing the KDF cost breaks decryption.
    const header = Buffer.from(file.toString('latin1').replace('"timeCost":3', '"timeCost":2'), 'latin1')
    await expect(readBackup(header, PW)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' })
  })

  it('rejects files that are not backups or demand absurd KDF costs', async () => {
    await expect(readBackup(Buffer.from('hello world'), PW)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    const file = await createBackup(t.sqlite, t.key, PW, '0.1.0')
    const evil = Buffer.from(file.toString('latin1').replace('"memoryCost":65536', '"memoryCost":9999999'), 'latin1')
    // Length differs, so fix up the header length prefix.
    const magicLen = 'CI-INVENTORY-BACKUP\n'.length
    evil.writeUInt32BE(file.readUInt32BE(magicLen) + 2, magicLen)
    await expect(readBackup(evil, PW)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })

  it('refuses backups from a newer app version', async () => {
    const contents = await readBackup(await createBackup(t.sqlite, t.key, PW, '9.9.9'), PW)
    contents.meta.migrations = 999
    expect(() => inspectBackup(contents, MIGRATIONS)).toThrow(expect.objectContaining({ code: 'BACKUP_TOO_NEW' }))
  })

  it('detects a backup whose audit log was tampered with before backing up', async () => {
    t.sqlite.exec(`DROP TRIGGER audit_log_no_update; UPDATE audit_log SET action = 'forged' WHERE id = 1;`)
    const contents = await readBackup(await createBackup(t.sqlite, t.key, PW, '0.1.0'), PW)
    expect(() => inspectBackup(contents, MIGRATIONS)).toThrow(expect.objectContaining({ code: 'BACKUP_TAMPERED' }))
    const target = path.join(out.dir, 'x.db')
    expect(() => writeRestoredDatabase(contents, target, MIGRATIONS)).toThrow(expect.objectContaining({ code: 'BACKUP_TAMPERED' }))
    expect(existsSync(target)).toBe(true) // caller deletes the rejected temp file
  })
})
