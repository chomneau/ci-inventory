/** Every IPC channel the renderer may call. The preload exposes nothing else. */
export const Channels = {
  appGetInfo: 'app:get-info',

  authGetStatus: 'auth:get-status',
  authSetupAdmin: 'auth:setup-admin',
  authLogin: 'auth:login',
  authVerifyTotp: 'auth:verify-totp',
  authUseRecoveryCode: 'auth:use-recovery-code',
  authBeginEnrollment: 'auth:begin-enrollment',
  authConfirmEnrollment: 'auth:confirm-enrollment',
  authAcknowledgeRecoveryCodes: 'auth:ack-recovery-codes',
  authChangePassword: 'auth:change-password',
  authUnlock: 'auth:unlock',
  authLock: 'auth:lock',
  authLogout: 'auth:logout',

  categoriesList: 'categories:list',
  categoriesCreate: 'categories:create',
  categoriesUpdate: 'categories:update',
  categoriesDelete: 'categories:delete',

  locationsList: 'locations:list',
  locationsCreate: 'locations:create',
  locationsUpdate: 'locations:update',
  locationsSetArchived: 'locations:set-archived',

  itemsList: 'items:list',
  itemsGet: 'items:get',
  itemsCreate: 'items:create',
  itemsUpdate: 'items:update',
  itemsSetArchived: 'items:set-archived',
  itemsChoosePhoto: 'items:choose-photo',
  itemsRemovePhoto: 'items:remove-photo',
  itemsPhoto: 'items:photo',
  itemsLabel: 'items:label',

  staffList: 'staff:list',
  staffGet: 'staff:get',
  staffCreate: 'staff:create',
  staffUpdate: 'staff:update',
  staffSetArchived: 'staff:set-archived',
  staffSetPin: 'staff:set-pin',
  staffBadge: 'staff:badge',

  stockRecord: 'stock:record',
  stockList: 'stock:list',
  dashboardSummary: 'dashboard:summary',
  dashboardAnalytics: 'dashboard:analytics',
  exportCsv: 'export:csv',
  printPage: 'app:print',

  authStepUp: 'auth:step-up',
  authRegenerateRecoveryCodes: 'auth:regenerate-recovery-codes',
  authActivity: 'auth:activity',

  usersList: 'users:list',
  usersCreate: 'users:create',
  usersUpdate: 'users:update',
  usersSetDisabled: 'users:set-disabled',
  usersUnlock: 'users:unlock',
  usersResetPassword: 'users:reset-password',
  usersResetAuthenticator: 'users:reset-authenticator',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  backupCreate: 'backup:create',
  backupInspect: 'backup:inspect',
  backupApply: 'backup:apply',
  backupCancel: 'backup:cancel',

  auditList: 'audit:list',
  auditVerify: 'audit:verify',
  auditExport: 'audit:export',

  updatesStatus: 'updates:status',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesOpenRelease: 'updates:open-release'
} as const

export type Channel = (typeof Channels)[keyof typeof Channels]

/** Main → renderer notifications. */
export const Events = {
  authStatusChanged: 'auth:status-changed',
  /** Inventory data changed; the renderer should refetch. */
  inventoryChanged: 'inventory:changed',
  updateStatusChanged: 'updates:status-changed'
} as const
