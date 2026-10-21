import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { PasswordInput } from '@renderer/components/ui/password-input'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

export function LoginScreen() {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const { run, pending, error } = useAction()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const status = await run(() => unwrap(window.ci.auth.login({ email, password })))
    if (status) setStatus(status)
    else setPassword('')
  }

  return (
    <AuthLayout eyebrow="សូមស្វាគមន៍" title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" autoFocus required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <PasswordInput id="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {t('auth.login.submit')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t('auth.login.forgot')}</p>
      </form>
    </AuthLayout>
  )
}
