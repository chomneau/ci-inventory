import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, KeyRound, LogIn, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { CodeInput } from '@renderer/components/ui/code-input'
import { Field } from '@renderer/components/ui/field'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useAction } from '@renderer/lib/ipc'

/** New recovery codes, confirmed with an authenticator code. */
export function RecoveryCodesCard() {
  const { t } = useTranslation()
  const { run, pending, error } = useAction()
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await run(() => unwrap(window.ci.security.regenerateRecoveryCodes({ code })))
    setCode('')
    if (result) setCodes(result)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('security.recoveryTitle')}</CardTitle>
        <CardDescription>{t('security.recoveryHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {codes ? (
          <>
            <Alert variant="success">{t('security.recoveryDone')}</Alert>
            <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/50 p-4 font-mono text-sm sm:grid-cols-5">
              {codes.map((c) => (
                <span key={c} className="select-all text-center">
                  {c}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(codes.join('\n'))
                  setCopied(true)
                }}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? t('common.copied') : t('auth.recovery.copy')}
              </Button>
              <Button variant="ghost" onClick={() => setCodes(null)}>
                {t('common.close')}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit} className="grid max-w-md gap-3">
            {error ? <Alert>{error}</Alert> : null}
            <Field label={t('auth.totp.codeLabel')} htmlFor="rc-code">
              <CodeInput id="rc-code" value={code} onChange={setCode} className="h-11 text-lg" />
            </Field>
            <Button type="submit" className="justify-self-start" disabled={pending || code.length !== 6}>
              <KeyRound />
              {t('security.recoveryButton')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

const ACTIVITY_ICON: Record<string, typeof LogIn> = {
  'auth.login': LogIn,
  'auth.logout': LogOut,
  'auth.login_failed': ShieldAlert,
  'auth.account_locked': ShieldAlert
}

/** The signed-in user's own recent sign-in events. */
export function ActivityCard() {
  const { t } = useTranslation()
  const { dateTime } = useFormat()
  const { data = [] } = useQuery({ queryKey: ['activity'], queryFn: () => unwrap(window.ci.security.activity()) })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('security.activityTitle')}</CardTitle>
        <CardDescription>{t('security.activityHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {data.map((e) => {
            const Icon = ACTIVITY_ICON[e.action] ?? ShieldCheck
            const bad = e.action === 'auth.login_failed' || e.action === 'auth.account_locked'
            return (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <Icon className={bad ? 'size-4 text-red-500' : 'size-4 text-muted-foreground'} />
                <span className="flex-1">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</span>
                <span className="text-xs text-muted-foreground">{dateTime(e.at)}</span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
