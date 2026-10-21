import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { clearRecoveryCodes, peekRecoveryCodes } from './recovery-codes-store'

/** Shows the one-time recovery codes once, right after enrollment. */
export function RecoveryCodesScreen() {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const { run, pending } = useAction()
  const [codes] = useState<string[]>(peekRecoveryCodes)
  // Forget the codes as soon as this screen goes away; they are never shown again.
  useEffect(() => clearRecoveryCodes, [])
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    await navigator.clipboard.writeText(codes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const onContinue = async () => {
    const status = await run(() => unwrap(window.ci.auth.acknowledgeRecoveryCodes()))
    if (status) setStatus(status)
  }

  return (
    <AuthLayout title={t('auth.recovery.title')} subtitle={t('auth.recovery.subtitle')}>
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {t('auth.recovery.warning')}
      </div>
      {codes.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/50 p-4 font-mono text-sm">
          {codes.map((c) => (
            <span key={c} className="select-all text-center">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('auth.recovery.unavailable')}</p>
      )}
      <Button variant="outline" className="w-full" onClick={() => void copyAll()} disabled={codes.length === 0}>
        {copied ? <Check /> : <Copy />}
        {copied ? t('common.copied') : t('auth.recovery.copy')}
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {t('auth.recovery.confirm')}
      </label>
      <Button className="w-full" disabled={!saved || pending} onClick={() => void onContinue()}>
        {t('common.continue')}
      </Button>
    </AuthLayout>
  )
}
