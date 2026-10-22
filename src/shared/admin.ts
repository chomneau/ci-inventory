import { z } from 'zod'
import type { Role } from './auth'

export const ROLE_VALUES = ['admin', 'storekeeper', 'viewer'] as const satisfies readonly Role[]

const email = z.string().trim().toLowerCase().pipe(z.email().max(254))
const displayName = z.string().trim().min(1).max(100)
const id = z.number().int().positive()

export const userCreate = z.object({ email, displayName, role: z.enum(ROLE_VALUES) })
export const userUpdate = z.object({ id, displayName, role: z.enum(ROLE_VALUES) })

export interface ManagedUser {
  id: number
  email: string
  displayName: string
  role: Role
  disabled: boolean
  locked: boolean
  mustChangePassword: boolean
  authenticatorLinked: boolean
  lastLoginAt: number | null
  createdAt: number
}

/** Shown exactly once to the admin; never stored or retrievable again. */
export interface TemporaryPassword {
  userId: number
  email: string
  temporaryPassword: string
}

export const appSettingsUpdate = z.object({
  idleLockMinutes: z.number().int().min(1).max(240).optional(),
  officeName: z.string().trim().min(1).max(120).optional(),
  backupReminderDays: z.number().int().min(1).max(90).optional(),
  updatesEnabled: z.boolean().optional(),
  requireStaffConfirmation: z.boolean().optional()
})

export interface AppSettings {
  idleLockMinutes: number
  officeName: string
  backupReminderDays: number
  /** Check GitHub Releases for new versions (admins can turn this off). */
  updatesEnabled: boolean
  /** Every stock-out must name a staff member who confirms with their PIN. */
  requireStaffConfirmation: boolean
  /** Epoch ms of the last successful backup, or null if never. */
  lastBackupAt: number | null
}

export const auditListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  actorUserId: id.optional(),
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).default(0)
})

export interface AuditEntry {
  id: number
  at: number
  actorUserId: number | null
  actorName: string | null
  action: string
  entityType: string | null
  entityId: string | null
  details: Record<string, unknown>
}

export type AuditVerificationResult =
  | { ok: true; entries: number }
  | { ok: false; entries: number; brokenAtId: number; reason: 'gap' | 'prev_hash' | 'hash' | 'truncated' }

export interface BackupSummary {
  /** Opaque handle for the pending restore (kept only in main-process memory). */
  token: string
  createdAt: number
  appVersion: string
  counts: { users: number; items: number; movements: number; auditEntries: number }
}
