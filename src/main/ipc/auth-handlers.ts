import { z } from 'zod'
import { PASSWORD_MAX_LENGTH } from '@shared/auth'
import { Channels } from '@shared/channels'
import type { AuthService } from '../auth/auth-service'
import { handle } from './router'

const email = z.string().trim().toLowerCase().pipe(z.email().max(254))
// Policy is enforced in AuthService; here only a hard upper bound against oversized input.
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH)
const totpCode = z
  .string()
  .transform((s) => s.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/))
const none = z.undefined()

/** Sign-in endpoints are 'public': the AuthService itself enforces which stage each is valid in. */
export function registerAuthHandlers(auth: AuthService): void {
  handle(Channels.authGetStatus, none, () => auth.status(), 'public')

  handle(
    Channels.authSetupAdmin,
    z.object({ email, displayName: z.string().trim().min(1).max(100), password: z.string().max(PASSWORD_MAX_LENGTH) }),
    (input) => auth.setupAdmin(input),
    'public'
  )
  handle(Channels.authLogin, z.object({ email, password }), (input) => auth.login(input), 'public')
  handle(Channels.authVerifyTotp, z.object({ code: totpCode }), (input) => auth.verifyTotp(input), 'public')
  handle(Channels.authUseRecoveryCode, z.object({ code: z.string().min(1).max(32) }), (input) => auth.useRecoveryCode(input), 'public')
  handle(Channels.authBeginEnrollment, none, () => auth.beginEnrollment(), 'public')
  handle(Channels.authConfirmEnrollment, z.object({ code: totpCode }), (input) => auth.confirmEnrollment(input), 'public')
  handle(Channels.authAcknowledgeRecoveryCodes, none, () => auth.acknowledgeRecoveryCodes(), 'public')
  handle(
    Channels.authChangePassword,
    z.object({
      currentPassword: password.optional(),
      newPassword: z.string().max(PASSWORD_MAX_LENGTH),
      code: totpCode.optional()
    }),
    (input) => auth.changePassword(input),
    'public'
  )
  handle(Channels.authUnlock, z.object({ password }), (input) => auth.unlock(input), 'public')
  handle(Channels.authLock, none, () => auth.lock('user'), 'public')
  handle(Channels.authLogout, none, () => auth.logout(), 'public')
}
