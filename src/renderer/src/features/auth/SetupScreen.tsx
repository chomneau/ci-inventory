import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { PasswordInput } from '@renderer/components/ui/password-input'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { isPasswordAcceptable, PasswordChecklist } from './PasswordChecklist'

/** First run only: create the administrator account. */
export function SetupScreen() {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const { run, pending, error, setError } = useAction()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError(t('auth.passwordsDontMatch'))
    const status = await run(() => unwrap(window.ci.auth.setupAdmin({ email, displayName, password })))
    if (status) setStatus(status)
  }

  return (
    <AuthLayout eyebrow="សូមស្វាគមន៍" title={t('auth.setup.title')} subtitle={t('auth.setup.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t('auth.fullName')} htmlFor="name">
          <Input id="name" autoFocus required maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" hint={<PasswordChecklist password={password} email={email} />}>
          <PasswordInput id="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.confirmPassword')} htmlFor="confirm">
          <PasswordInput id="confirm" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || !isPasswordAcceptable(password, email) || !confirm}>
          {t('auth.setup.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
