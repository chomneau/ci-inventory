import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Smartphone } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { CodeInput } from '@renderer/components/ui/code-input'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

/** Second step of sign-in: authenticator code, or a recovery code as fallback. */
export function TotpScreen({ email }: { email: string }) {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const { run, pending, error } = useAction()
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp')
  const [code, setCode] = useState('')

  const submit = async () => {
    const status = await run(() =>
      unwrap(mode === 'totp' ? window.ci.auth.verifyTotp({ code }) : window.ci.auth.useRecoveryCode({ code }))
    )
    if (status) setStatus(status)
    else setCode('')
  }

  // Submit automatically once all six digits are in.
  useEffect(() => {
    if (mode === 'totp' && code.length === 6 && !pending) void submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, mode])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit()
  }

  return (
    <AuthLayout
      title={t('auth.totp.title')}
      subtitle={mode === 'totp' ? t('auth.totp.subtitle', { email }) : t('auth.totp.recoverySubtitle')}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {mode === 'totp' ? (
          <Field label={t('auth.totp.codeLabel')} htmlFor="code">
            <CodeInput id="code" autoFocus value={code} onChange={setCode} disabled={pending} />
          </Field>
        ) : (
          <Field label={t('auth.totp.recoveryLabel')} htmlFor="recovery">
            <Input
              id="recovery"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase tracking-widest"
              placeholder="XXXXX-XXXXX"
              maxLength={32}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        )}
        <Button type="submit" className="w-full" disabled={pending || (mode === 'totp' ? code.length !== 6 : code.length < 10)}>
          {t('auth.totp.submit')}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode(mode === 'totp' ? 'recovery' : 'totp')
              setCode('')
            }}
          >
            {mode === 'totp' ? <KeyRound /> : <Smartphone />}
            {mode === 'totp' ? t('auth.totp.useRecovery') : t('auth.totp.useApp')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void unwrap(window.ci.auth.logout()).then(setStatus)}>
            {t('auth.backToSignIn')}
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
