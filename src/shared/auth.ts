export type Role = 'admin' | 'storekeeper' | 'viewer'

export interface PublicUser {
  id: number
  email: string
  displayName: string
  role: Role
}

/** What the renderer should show. Driven entirely by the main process. */
export type AuthStatus =
  | { stage: 'setup_required' }
  | { stage: 'signed_out' }
  | { stage: 'totp_required'; email: string }
  | { stage: 'enrollment_required'; email: string }
  | { stage: 'recovery_codes'; email: string }
  | { stage: 'password_change_required'; email: string }
  | { stage: 'locked'; user: PublicUser }
  | { stage: 'signed_in'; user: PublicUser }

export interface TotpEnrollment {
  /** PNG data URL of the otpauth:// QR code. */
  qrDataUrl: string
  /** Base32 secret, grouped for manual entry. */
  manualKey: string
  issuer: string
  account: string
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'INVALID_CODE'
  | 'SESSION_EXPIRED'
  | 'WRONG_STAGE'
  | 'SETUP_ALREADY_DONE'
  | 'WEAK_PASSWORD'
  | 'PASSWORD_REUSED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'

// ---- Password policy (shared so the UI can give live feedback; enforced in main) ----

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export type PasswordIssue = 'too_short' | 'too_long' | 'too_simple' | 'too_common' | 'contains_email'

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty', 'qwertyuiop', 'qwerty123', '123456789012',
  '1234567890', 'iloveyou', 'admin', 'administrator', 'welcome', 'welcome1', 'letmein', 'changeme',
  'abc123', 'football', 'monkey', 'dragon', 'sunshine', 'princess', 'trustno1', 'cambodia', 'phnompenh',
  'inventory', 'ciinventory', 'cicambodia', 'superadmin', 'p@ssw0rd', 'p@ssword', 'aaaaaaaaaaaa'
])

export function passwordIssues(password: string, email?: string): PasswordIssue[] {
  const issues: PasswordIssue[] = []
  if (password.length < PASSWORD_MIN_LENGTH) issues.push('too_short')
  if (password.length > PASSWORD_MAX_LENGTH) issues.push('too_long')
  if (new Set(password).size < 6) issues.push('too_simple')

  const lower = password.toLowerCase()
  const stripped = lower.replace(/[^a-z@]/g, '')
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripped)) issues.push('too_common')

  const localPart = email?.split('@')[0]?.toLowerCase()
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) issues.push('contains_email')
  return issues
}
