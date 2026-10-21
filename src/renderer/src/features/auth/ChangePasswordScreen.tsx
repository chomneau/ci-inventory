import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { PasswordInput } from '@renderer/components/ui/password-input'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { isPasswordAcceptable, PasswordChecklist } from './PasswordChecklist'

/** Shown when an administrator has issued a temporary password. */
export function ChangePasswordScreen({ email }: { email: string }) {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const { run, pending, error, setError } = useAction()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError(t('auth.passwordsDontMatch'))
    const status = await run(() => unwrap(window.ci.auth.changePassword({ newPassword: password })))
    if (status) setStatus(status)
  }

  return (
    <AuthLayout title={t('auth.forceChange.title')} subtitle={t('auth.forceChange.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t('auth.newPassword')} htmlFor="password" hint={<PasswordChecklist password={password} email={email} />}>
          <PasswordInput id="password" autoFocus required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.confirmPassword')} htmlFor="confirm">
          <PasswordInput id="confirm" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || !isPasswordAcceptable(password, email) || !confirm}>
          {t('auth.forceChange.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
