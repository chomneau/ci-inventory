import { contextBridge, ipcRenderer } from 'electron'
import { Channels, Events, type Channel } from '@shared/channels'
import type { CiApi } from '@shared/api'
import type { AuthStatus } from '@shared/auth'
import type { UpdateStatus } from '@shared/updates'

// Only named, purpose-built functions cross the bridge. ipcRenderer itself is never exposed.
const call = (channel: Channel, input?: unknown) => ipcRenderer.invoke(channel, input)

const api: CiApi = {
  app: {
    getInfo: () => call(Channels.appGetInfo)
  },
  auth: {
    getStatus: () => call(Channels.authGetStatus),
    setupAdmin: (input) => call(Channels.authSetupAdmin, input),
    login: (input) => call(Channels.authLogin, input),
    verifyTotp: (input) => call(Channels.authVerifyTotp, input),
    useRecoveryCode: (input) => call(Channels.authUseRecoveryCode, input),
    beginEnrollment: () => call(Channels.authBeginEnrollment),
    confirmEnrollment: (input) => call(Channels.authConfirmEnrollment, input),
    acknowledgeRecoveryCodes: () => call(Channels.authAcknowledgeRecoveryCodes),
    changePassword: (input) => call(Channels.authChangePassword, input),
    unlock: (input) => call(Channels.authUnlock, input),
    lock: () => call(Channels.authLock),
    logout: () => call(Channels.authLogout),
    onStatusChanged: (listener) => {
      // Forward only the payload; the IPC event object never reaches the page.
      const wrapped = (_event: Electron.IpcRendererEvent, status: AuthStatus) => listener(status)
      ipcRenderer.on(Events.authStatusChanged, wrapped)
      return () => ipcRenderer.removeListener(Events.authStatusChanged, wrapped)
    }
  },
  categories: {
    list: () => call(Channels.categoriesList),
    create: (input) => call(Channels.categoriesCreate, input),
    update: (input) => call(Channels.categoriesUpdate, input),
    delete: (input) => call(Channels.categoriesDelete, input)
  },
  locations: {
    list: (input) => call(Channels.locationsList, input),
    create: (input) => call(Channels.locationsCreate, input),
    update: (input) => call(Channels.locationsUpdate, input),
    setArchived: (input) => call(Channels.locationsSetArchived, input)
  },
  items: {
    list: (input) => call(Channels.itemsList, input),
    get: (input) => call(Channels.itemsGet, input),
    create: (input) => call(Channels.itemsCreate, input),
    update: (input) => call(Channels.itemsUpdate, input),
    setArchived: (input) => call(Channels.itemsSetArchived, input),
    choosePhoto: (input) => call(Channels.itemsChoosePhoto, input),
    removePhoto: (input) => call(Channels.itemsRemovePhoto, input),
    photo: (input) => call(Channels.itemsPhoto, input),
    label: (input) => call(Channels.itemsLabel, input)
  },
  stock: {
    record: (input) => call(Channels.stockRecord, input),
    list: (input) => call(Channels.stockList, input)
  },
  dashboard: {
    summary: () => call(Channels.dashboardSummary)
  },
  exports: {
    csv: (input) => call(Channels.exportCsv, input)
  },
  print: () => call(Channels.printPage),
  onInventoryChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(Events.inventoryChanged, wrapped)
    return () => ipcRenderer.removeListener(Events.inventoryChanged, wrapped)
  },
  security: {
    stepUp: (input) => call(Channels.authStepUp, input),
    regenerateRecoveryCodes: (input) => call(Channels.authRegenerateRecoveryCodes, input),
    activity: () => call(Channels.authActivity)
  },
  users: {
    list: () => call(Channels.usersList),
    create: (input) => call(Channels.usersCreate, input),
    update: (input) => call(Channels.usersUpdate, input),
    setDisabled: (input) => call(Channels.usersSetDisabled, input),
    unlock: (input) => call(Channels.usersUnlock, input),
    resetPassword: (input) => call(Channels.usersResetPassword, input),
    resetAuthenticator: (input) => call(Channels.usersResetAuthenticator, input)
  },
  settings: {
    get: () => call(Channels.settingsGet),
    update: (input) => call(Channels.settingsUpdate, input)
  },
  backup: {
    create: (input) => call(Channels.backupCreate, input),
    inspect: (input) => call(Channels.backupInspect, input),
    apply: (input) => call(Channels.backupApply, input),
    cancel: () => call(Channels.backupCancel)
  },
  audit: {
    list: (input) => call(Channels.auditList, input),
    verify: () => call(Channels.auditVerify),
    exportCsv: () => call(Channels.auditExport)
  },
  updates: {
    status: () => call(Channels.updatesStatus),
    check: () => call(Channels.updatesCheck),
    install: () => call(Channels.updatesInstall),
    openRelease: () => call(Channels.updatesOpenRelease),
    onStatusChanged: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status)
      ipcRenderer.on(Events.updateStatusChanged, wrapped)
      return () => ipcRenderer.removeListener(Events.updateStatusChanged, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('ci', api)
