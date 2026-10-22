import type { AppSettings, AuditEntry, AuditVerificationResult, BackupSummary, ManagedUser, TemporaryPassword } from './admin'
import type { AuthStatus, Role, TotpEnrollment } from './auth'
import type { UpdateStatus } from './updates'
import type { StaffBadge, StaffMember } from './staff'
import type { IpcResult } from './ipc-result'
import type {
  Category,
  DashboardSummary,
  InventoryAnalytics,
  ItemDetail,
  ItemLabel,
  ItemSummary,
  Location,
  Movement,
  StockMovementInput
} from './inventory'

export interface AppInfo {
  name: string
  version: string
  platform: string
  electron: string
  chrome: string
  /** Active cipher of the local database, e.g. "sqlcipher". */
  databaseCipher: string
}

type Call<T> = Promise<IpcResult<T>>

/** Shape of `window.ci`, implemented by the preload script. */
export interface CiApi {
  app: {
    getInfo(): Call<AppInfo>
  }
  auth: {
    getStatus(): Call<AuthStatus>
    setupAdmin(input: { email: string; displayName: string; password: string }): Call<AuthStatus>
    login(input: { email: string; password: string }): Call<AuthStatus>
    verifyTotp(input: { code: string }): Call<AuthStatus>
    useRecoveryCode(input: { code: string }): Call<AuthStatus>
    beginEnrollment(): Call<TotpEnrollment>
    /** Returns the one-time recovery codes; they are never shown again. */
    confirmEnrollment(input: { code: string }): Call<{ status: AuthStatus; recoveryCodes: string[] }>
    acknowledgeRecoveryCodes(): Call<AuthStatus>
    changePassword(input: { currentPassword?: string; newPassword: string; code?: string }): Call<AuthStatus>
    unlock(input: { password: string }): Call<AuthStatus>
    lock(): Call<AuthStatus>
    logout(): Call<AuthStatus>
    /** Subscribe to status pushes from main (idle lock, OS lock...). Returns an unsubscribe function. */
    onStatusChanged(listener: (status: AuthStatus) => void): () => void
  }
  categories: {
    list(): Call<Category[]>
    create(input: { nameEn: string; nameKm?: string | null }): Call<Category>
    update(input: { id: number; nameEn: string; nameKm?: string | null }): Call<void>
    delete(input: { id: number }): Call<void>
  }
  locations: {
    list(input?: { includeArchived?: boolean }): Call<Location[]>
    create(input: { name: string; description?: string | null }): Call<Location>
    update(input: { id: number; name: string; description?: string | null }): Call<void>
    setArchived(input: { id: number; archived: boolean }): Call<void>
  }
  items: {
    list(input?: { search?: string; categoryId?: number | null; lowStockOnly?: boolean; includeArchived?: boolean }): Call<ItemSummary[]>
    get(input: { id: number }): Call<ItemDetail>
    create(input: ItemFields & { openingQuantity?: number }): Call<ItemDetail>
    update(input: ItemFields & { id: number }): Call<ItemDetail>
    setArchived(input: { id: number; archived: boolean }): Call<void>
    /** Opens a native file picker in main; the renderer never sees file paths. */
    choosePhoto(input: { id: number }): Call<{ updated: boolean }>
    removePhoto(input: { id: number }): Call<void>
    photo(input: { id: number; variant: 'image' | 'thumbnail' }): Call<string | null>
    label(input: { id: number }): Call<ItemLabel>
  }
  staff: {
    list(input?: { includeArchived?: boolean }): Call<StaffMember[]>
    get(input: { id: number }): Call<StaffMember>
    /** Leave `code` empty to have one generated. */
    create(input: { code?: string; name: string; department?: string | null }): Call<StaffMember>
    update(input: { id: number; code: string; name: string; department?: string | null }): Call<StaffMember>
    setArchived(input: { id: number; archived: boolean }): Call<void>
    /** Typed by the staff member themselves; also clears a PIN lockout. */
    setPin(input: { id: number; pin: string }): Call<void>
    badge(input: { id: number }): Call<StaffBadge>
  }
  stock: {
    /** For a stock-out to a staff member, include `staffId` and the PIN they typed. */
    record(input: StockMovementInput): Call<{ movementId: number }>
    list(input?: {
      itemId?: number | null
      staffId?: number | null
      type?: Movement['type']
      search?: string
      limit?: number
      offset?: number
    }): Call<Movement[]>
  }
  dashboard: {
    summary(): Call<DashboardSummary>
    analytics(input: { days: 7 | 30 | 90; locationId?: number | null }): Call<InventoryAnalytics>
  }
  exports: {
    /** Shows a native save dialog and writes the CSV in main. */
    csv(input: { kind: 'items' | 'movements' }): Call<{ saved: boolean; fileName?: string }>
  }
  print(): Call<void>
  onInventoryChanged(listener: () => void): () => void
  security: {
    /** Re-confirm with an authenticator code; unlocks admin actions for 5 minutes. */
    stepUp(input: { code: string }): Call<void>
    regenerateRecoveryCodes(input: { code: string }): Call<string[]>
    activity(): Call<AuditEntry[]>
  }
  users: {
    list(): Call<ManagedUser[]>
    create(input: { email: string; displayName: string; role: Role }): Call<TemporaryPassword>
    update(input: { id: number; displayName: string; role: Role }): Call<void>
    setDisabled(input: { id: number; disabled: boolean }): Call<void>
    unlock(input: { id: number }): Call<void>
    resetPassword(input: { id: number }): Call<TemporaryPassword>
    resetAuthenticator(input: { id: number }): Call<void>
  }
  settings: {
    get(): Call<AppSettings>
    update(input: {
      idleLockMinutes?: number
      officeName?: string
      backupReminderDays?: number
      updatesEnabled?: boolean
      requireStaffConfirmation?: boolean
    }): Call<AppSettings>
  }
  backup: {
    /** Encrypts with `password` and writes via a native save dialog. */
    create(input: { password: string }): Call<{ saved: boolean; fileName?: string }>
    /** Native open dialog, then decrypt + validate. null when the dialog was cancelled. */
    inspect(input: { password: string }): Call<BackupSummary | null>
    /** Replaces all data with the inspected backup, then restarts the app. */
    apply(input: { token: string }): Call<void>
    cancel(): Call<void>
  }
  audit: {
    list(input?: { search?: string; actorUserId?: number; limit?: number; offset?: number }): Call<AuditEntry[]>
    verify(): Call<AuditVerificationResult>
    exportCsv(): Call<{ saved: boolean; fileName?: string }>
  }
  updates: {
    status(): Call<UpdateStatus>
    /** Admins: check GitHub now. */
    check(): Call<UpdateStatus>
    /** Restart into a downloaded update (only when the user asks). */
    install(): Call<void>
    /** Unsigned macOS: open the release page to download by hand. */
    openRelease(): Call<void>
    onStatusChanged(listener: (status: UpdateStatus) => void): () => void
  }
}

export interface ItemFields {
  sku: string
  nameEn: string
  nameKm?: string | null
  categoryId?: number | null
  defaultLocationId?: number | null
  unit: string
  minStock: number
  unitCostCents: number
}
