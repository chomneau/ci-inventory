import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Loader2 } from 'lucide-react'
import type { TotpEnrollment } from '@shared/auth'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { CodeInput } from '@renderer/components/ui/code-input'
import { unwrap, useAction, useErrorText } from '@renderer/lib/ipc'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { holdRecoveryCodes } from './recovery-codes-store'

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-medium">{title}</div>
        {children}
      </div>
    </li>
  )
}

/** Links the user's phone authenticator app by QR code. Mandatory for every account. */
export function EnrollScreen({ email }: { email: string }) {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const errorText = useErrorText()
  const { run, pending, error } = useAction()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Each call issues a fresh secret; ignore stale responses (e.g. React StrictMode double effects).
    let current = true
    unwrap(window.ci.auth.beginEnrollment())
      .then((e) => current && setEnrollment(e))
      .catch((err) => current && setLoadError(errorText(err)))
    return () => {
      current = false
    }
  }, [errorText])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await run(() => unwrap(window.ci.auth.confirmEnrollment({ code })))
    if (result) {
      holdRecoveryCodes(result.recoveryCodes)
      setStatus(result.status)
    } else setCode('')
  }

  const copyKey = async () => {
    if (!enrollment) return
    await navigator.clipboard.writeText(enrollment.manualKey.replace(/ /g, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AuthLayout title={t('auth.enroll.title')} subtitle={t('auth.enroll.subtitle', { email })}>
      {loadError ? <Alert>{loadError}</Alert> : null}
      <ol className="space-y-5">
        <Step n={1} title={t('auth.enroll.step1')}>
          <p className="text-xs text-muted-foreground">{t('auth.enroll.step1Hint')}</p>
        </Step>
        <Step n={2} title={t('auth.enroll.step2')}>
          <div className="flex justify-center rounded-xl border bg-white p-3">
            {enrollment ? (
              <img src={enrollment.qrDataUrl} alt={t('auth.enroll.qrAlt')} className="size-40" />
            ) : (
              <div className="grid size-40 place-items-center">
                <Loader2 className="size-6 animate-spin text-slate-400" />
              </div>
            )}
          </div>
          {enrollment ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('auth.enroll.manual')}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{enrollment.manualKey}</code>
                <Button variant="outline" size="icon" onClick={() => void copyKey()} aria-label={t('common.copy')}>
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          ) : null}
        </Step>
        <Step n={3} title={t('auth.enroll.step3')}>
          <form onSubmit={onSubmit} className="space-y-3">
            {error ? <Alert>{error}</Alert> : null}
            <CodeInput value={code} onChange={setCode} disabled={!enrollment || pending} aria-label={t('auth.totp.codeLabel')} />
            <Button type="submit" className="w-full" disabled={!enrollment || pending || code.length !== 6}>
              {t('auth.enroll.submit')}
            </Button>
          </form>
        </Step>
      </ol>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => void unwrap(window.ci.auth.logout()).then(setStatus)}>
        {t('auth.backToSignIn')}
      </Button>
    </AuthLayout>
  )
}
