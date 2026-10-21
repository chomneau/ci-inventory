import { join } from 'node:path'
import { app, BrowserWindow, dialog, session } from 'electron'
import { APP_ENTRY_URL, isTrustedRendererUrl } from './security/origin'
import { registerAppProtocol, registerAppSchemePrivileges } from './security/protocol'
import { applyDevCsp, installWebContentsGuards, lockDownPermissions } from './security/hardening'
import { setSessionResolver, setTrustedSender } from './ipc/router'
import { registerAppHandlers } from './ipc/handlers'
import { registerAuthHandlers } from './ipc/auth-handlers'
import { registerInventoryHandlers } from './ipc/inventory-handlers'
import { InventoryService } from './services/inventory'
import { registerAdminHandlers } from './ipc/admin-handlers'
import { UserAdminService } from './services/users'
import { getAppSettings } from './services/app-settings'
import { initLogger, log, logFilePath } from './logger'
import { startUpdater } from './updater'
import { installProductionMenu } from './menu'
import { Events } from '@shared/channels'
import { closeDatabase, getDb, getSubkey, initDatabase } from './db'
import { AuthService } from './auth/auth-service'
import { startIdleLock } from './auth/idle-lock'
import { showStartupError } from './startup-errors'

// Fuses block Node's --inspect, but Chromium's remote-debugging switches would
// still let local software attach to and drive the UI. Refuse to start with them.
const FORBIDDEN_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'inspect', 'inspect-brk', 'js-flags']
if (app.isPackaged && FORBIDDEN_SWITCHES.some((s) => app.commandLine.hasSwitch(s))) {
  app.exit(1)
}

// Never trust the dev-server env var in a packaged build: it would let anyone
// point the app at a remote page by setting an environment variable.
const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
const isTrustedUrl = (url: string): boolean => isTrustedRendererUrl(url, devServerUrl)

// Keep development data apart from a real installation on the same machine.
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')} (dev)`)
}

app.enableSandbox()

// Unexpected errors are logged and the app keeps running, instead of Electron's raw "JavaScript error" box.
let errorShown = false
const onUnexpected = (kind: string) => (err: unknown) => {
  log.error(`[${kind}]`, err)
  if (app.isPackaged && app.isReady() && !errorShown) {
    errorShown = true
    dialog.showErrorBox('CI Inventory', `Something went wrong. Your data is safe.\n\nDetails were saved to:\n${logFilePath() ?? 'the log file'}`)
  }
}
process.on('uncaughtException', onUnexpected('uncaughtException'))
process.on('unhandledRejection', onUnexpected('unhandledRejection'))
registerAppSchemePrivileges()
installWebContentsGuards(isTrustedUrl)

let mainWindow: BrowserWindow | null = null
let auth: AuthService | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'CI Inventory',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    // macOS keeps the app running without windows; never leave a session open behind it.
    auth?.lock('window_closed')
  })
  void mainWindow.loadURL(devServerUrl ?? APP_ENTRY_URL)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    initLogger()
    log.info(`CI Inventory ${app.getVersion()} starting (${process.platform}/${process.arch})`)
    try {
      initDatabase()
    } catch (err) {
      showStartupError(err)
      app.exit(1)
      return
    }

    lockDownPermissions(session.defaultSession, isTrustedUrl)
    if (devServerUrl) {
      applyDevCsp()
    } else {
      registerAppProtocol(join(__dirname, '../renderer'))
      installProductionMenu()
    }
    const db = getDb()
    auth = new AuthService({
      db,
      totpKey: getSubkey('totp-secrets'),
      onChange: (status) => mainWindow?.webContents.send(Events.authStatusChanged, status)
    })
    const signedInAuth = auth
    // Automated UI tests run while nobody touches the machine; dev builds may opt out. Never honoured when packaged.
    const idleLockDisabled = !app.isPackaged && process.env['CI_INV_DISABLE_IDLE_LOCK'] === '1'
    if (!idleLockDisabled) {
      startIdleLock(signedInAuth, () => getAppSettings(db).idleLockMinutes)
    }

    setTrustedSender(isTrustedUrl)
    setSessionResolver(() => signedInAuth.currentUser())
    registerAppHandlers()
    registerAuthHandlers(signedInAuth)
    registerInventoryHandlers(new InventoryService(db))
    registerAdminHandlers(db, signedInAuth, new UserAdminService(db))
    startUpdater(() => getAppSettings(db).updatesEnabled)
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('will-quit', () => closeDatabase())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
