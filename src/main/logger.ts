import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'
import { app } from 'electron'

const MAX_BYTES = 1024 * 1024
const KEEP = 3
let file: string | null = null

/** Local, rotating log file at <userData>/logs/main.log (3 × 1 MB). Never contains secrets. */
export function initLogger(): string {
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  file = join(dir, 'main.log')
  return file
}

export function logFilePath(): string | null {
  return file
}

function rotate(path: string): void {
  if (!existsSync(path) || statSync(path).size < MAX_BYTES) return
  rmSync(`${path}.${KEEP}`, { force: true })
  for (let i = KEEP - 1; i >= 1; i--) if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`)
  renameSync(path, `${path}.1`)
}

function write(level: 'INFO' | 'WARN' | 'ERROR', args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${format(...args)}\n`
  if (level === 'ERROR') console.error(line.trimEnd())
  else console.log(line.trimEnd())
  if (!file) return
  try {
    rotate(file)
    appendFileSync(file, line, { mode: 0o600 })
  } catch {
    // Logging must never crash the app.
  }
}

export const log = {
  info: (...args: unknown[]) => write('INFO', args),
  warn: (...args: unknown[]) => write('WARN', args),
  error: (...args: unknown[]) => write('ERROR', args)
}
