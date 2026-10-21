import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { CodeInput } from '@renderer/components/ui/code-input'
import { Field } from '@renderer/components/ui/field'
import { PasswordInput } from '@renderer/components/ui/password-input'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useCurrentUser } from './AuthProvider'
import { isPasswordAcceptable, PasswordChecklist } from './PasswordChecklist'

/** Voluntary password change from Settings: needs current password and an authenticator code. */
export function ChangePasswordCard() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const { run, pending, error, setError } = useAction()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [done, setDone] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setDone(false)
    if (next !== confirm) return setError(t('auth.passwordsDontMatch'))
    const status = await run(() => unwrap(window.ci.auth.changePassword({ currentPassword: current, newPassword: next, code })))
    setCode('')
    if (status) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.security.title')}</CardTitle>
        <CardDescription>{t('settings.security.hint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-md gap-4">
          {error ? <Alert>{error}</Alert> : null}
          {done ? <Alert variant="success">{t('settings.security.changed')}</Alert> : null}
          <Field label={t('auth.currentPassword')} htmlFor="current">
            <PasswordInput id="current" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label={t('auth.newPassword')} htmlFor="next" hint={<PasswordChecklist password={next} email={user.email} />}>
            <PasswordInput id="next" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label={t('auth.confirmPassword')} htmlFor="confirm-next">
            <PasswordInput id="confirm-next" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Field label={t('auth.totp.codeLabel')} htmlFor="code">
            <CodeInput id="code" value={code} onChange={setCode} className="h-11 text-lg" />
          </Field>
          <Button type="submit" className="justify-self-start" disabled={pending || !current || !isPasswordAcceptable(next, user.email) || code.length !== 6}>
            {t('settings.security.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
