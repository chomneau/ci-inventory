import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { ChangePasswordScreen } from './ChangePasswordScreen'
import { EnrollScreen } from './EnrollScreen'
import { LockScreen } from './LockScreen'
import { LoginScreen } from './LoginScreen'
import { RecoveryCodesScreen } from './RecoveryCodesScreen'
import { SetupScreen } from './SetupScreen'
import { TotpScreen } from './TotpScreen'

/** Renders the app only for a fully signed-in user; otherwise the right sign-in step. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  switch (status.stage) {
    case 'signed_in':
      return <>{children}</>
    case 'setup_required':
      return <SetupScreen />
    case 'signed_out':
      return <LoginScreen />
    case 'totp_required':
      return <TotpScreen email={status.email} />
    case 'enrollment_required':
      return <EnrollScreen email={status.email} />
    case 'recovery_codes':
      return <RecoveryCodesScreen />
    case 'password_change_required':
      return <ChangePasswordScreen email={status.email} />
    case 'locked':
      return <LockScreen user={status.user} />
  }
}
