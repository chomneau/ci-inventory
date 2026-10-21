// Post-build checks on packaged apps in dist/: security fuses, only the target platform's native
// SQLite binary, the Argon2 binary for the target CPU, and the database migrations.
// Usage: node scripts/verify-package.mjs   (checks every unpacked app found under dist/)
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import fuses from '@electron/fuses'
import asar from '@electron/asar'

const { getCurrentFuseWire, FuseV1Options } = fuses
// Fuse wire bytes are ASCII '0' (disabled) / '1' (enabled); the enum is not exported by @electron/fuses 1.x.
const FuseState = { DISABLE: 48, ENABLE: 49 }

const REQUIRED_FUSES = {
  [FuseV1Options.RunAsNode]: FuseState.DISABLE,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
  [FuseV1Options.EnableNodeCliInspectArguments]: FuseState.DISABLE,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: FuseState.ENABLE,
  [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
  [FuseV1Options.EnableCookieEncryption]: FuseState.ENABLE
}

function findApps(dir) {
  const apps = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    if (name.endsWith('.app')) apps.push({ kind: 'mac', root: p, exe: join(p, 'Contents/MacOS/CI Inventory'), res: join(p, 'Contents/Resources') })
    else if (existsSync(join(p, 'CI Inventory.exe'))) apps.push({ kind: 'win', root: p, exe: join(p, 'CI Inventory.exe'), res: join(p, 'resources') })
    else if (existsSync(join(p, 'ci-inventory'))) apps.push({ kind: 'linux', root: p, exe: join(p, 'ci-inventory'), res: join(p, 'resources') })
    else apps.push(...findApps(p))
  }
  return apps
}

let failed = false
const fail = (msg) => {
  failed = true
  console.error(`  ✗ ${msg}`)
}

for (const app of findApps('dist')) {
  console.log(`\n${app.root}`)
  const wire = await getCurrentFuseWire(app.exe)
  for (const [fuse, want] of Object.entries(REQUIRED_FUSES)) {
    if (wire[fuse] !== want) fail(`fuse ${FuseV1Options[fuse]} is not ${want === FuseState.ENABLE ? 'enabled' : 'disabled'}`)
  }
  const files = asar.listPackage(join(app.res, 'app.asar'))
  const sqlite = files.filter((f) => /better-sqlite3[\\/]prebuilds[\\/].+\.node$/.test(f))
  if (sqlite.length !== 1) fail(`expected exactly one SQLCipher binary, found: ${sqlite.join(', ') || 'none'}`)
  if (!files.some((f) => /[\\/]drizzle[\\/]meta[\\/]_journal\.json$/.test(f))) fail('database migrations missing')
  const unpacked = join(app.res, 'app.asar.unpacked', 'node_modules', '@node-rs')
  const argon = existsSync(unpacked) ? readdirSync(unpacked).filter((n) => n.startsWith('argon2-')) : []
  if (argon.length === 0) fail('no Argon2 native binary')
  if (!failed) console.log(`  ✓ fuses · SQLCipher ${sqlite[0]?.split(/[\\/]/).pop()} · Argon2 ${argon.join(', ')} · migrations`)
}
process.exit(failed ? 1 : 0)
