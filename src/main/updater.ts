import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { Events } from '@shared/channels'
import type { UpdateStatus } from '@shared/updates'
import { log } from './logger'

const CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 24 * 60 * 60_000

interface ReleaseConfig {
  github: { owner: string; repo: string }
  /** False while releases live in a private repository the installed app cannot read. */
  autoUpdate: boolean
  /** Squirrel.Mac only installs updates into a signed app; until then macOS updates are manual. */
  macSigned: boolean
}

let status: UpdateStatus = { state: 'disabled', currentVersion: '' }
let config: ReleaseConfig | null = null

function readConfig(): ReleaseConfig {
  const pkg = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { ciInventory: ReleaseConfig }
  return pkg.ciInventory
}

function setStatus(next: Omit<UpdateStatus, 'currentVersion'>): void {
  status = { ...next, currentVersion: app.getVersion() }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(Events.updateStatusChanged, status)
}

/**
 * Checks GitHub Releases for a newer version (HTTPS; files verified by SHA-512 from
 * latest*.yml, and by code signature once the app is signed). Downloads quietly and
 * waits for the user to choose "Restart to update" — it never restarts on its own.
 */
export function startUpdater(enabled: () => boolean): void {
  status = { state: 'disabled', currentVersion: app.getVersion(), reason: 'development' }
  if (!app.isPackaged) return // dev builds never update themselves
  const cfg = readConfig()
  if (!cfg.autoUpdate) {
    status = { state: 'disabled', currentVersion: app.getVersion(), reason: 'not-configured' }
    return
  }
  config = cfg
  const manual = process.platform === 'darwin' && !config.macSigned

  autoUpdater.logger = { info: log.info, warn: log.warn, error: log.error, debug: () => undefined }
  autoUpdater.autoDownload = !manual
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'idle' }))
  autoUpdater.on('update-available', (info) => setStatus({ state: manual ? 'available' : 'downloading', version: info.version, manual, percent: 0 }))
  autoUpdater.on('download-progress', (p) => setStatus({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    log.warn('update check failed:', err?.message ?? err)
    setStatus({ state: 'error' })
  })

  setStatus({ state: 'idle' })
  setTimeout(() => void checkForUpdates(enabled), CHECK_DELAY_MS).unref()
  setInterval(() => void checkForUpdates(enabled), CHECK_INTERVAL_MS).unref()
}

export async function checkForUpdates(enabled: () => boolean = () => true): Promise<UpdateStatus> {
  if (!config || !enabled()) return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log.warn('update check failed:', (err as Error).message)
  }
  return status
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Only after the user asked for it. */
export function installDownloadedUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall(false, true)
}

/** Manual updates (unsigned macOS): open this version's GitHub release page in the browser. */
export function openReleasePage(): void {
  if (!config || !status.version || !/^\d+\.\d+\.\d+$/.test(status.version)) return
  const { owner, repo } = config.github
  void shell.openExternal(`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tag/v${status.version}`)
}
