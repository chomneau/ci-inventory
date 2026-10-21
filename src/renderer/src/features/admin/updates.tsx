import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { UpdateStatus } from '@shared/updates'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useStepUp } from '@renderer/lib/step-up'
import { useIsAdmin, useSettings } from './hooks'

function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    void unwrap(window.ci.updates.status()).then(setStatus).catch(() => undefined)
    return window.ci.updates.onStatusChanged(setStatus)
  }, [])
  return status
}

/** Thin bar at the top of the app when a new version is ready (or, on unsigned macOS, available to download). */
export function UpdateBanner() {
  const { t } = useTranslation()
  const s = useUpdateStatus()
  if (!s || !(s.state === 'ready' || (s.state === 'available' && s.manual))) return null
  return (
    <div className="flex items-center gap-3 border-b bg-accent px-6 py-2 text-sm text-accent-foreground">
      <Sparkles className="size-4" />
      <span className="flex-1">{t(s.state === 'ready' ? 'updates.ready' : 'updates.availableManual', { version: s.version })}</span>
      {s.state === 'ready' ? (
        <Button size="sm" onClick={() => void window.ci.updates.install()}>
          <RefreshCw />
          {t('updates.restart')}
        </Button>
      ) : (
        <Button size="sm" onClick={() => void window.ci.updates.openRelease()}>
          <Download />
          {t('updates.download')}
        </Button>
      )}
    </div>
  )
}

/** Version info for everyone; automatic-update policy and "check now" for admins. */
export function UpdatesCard() {
  const { t } = useTranslation()
  const s = useUpdateStatus()
  const isAdmin = useIsAdmin()
  const withStepUp = useStepUp()
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { run, pending } = useAction()

  const toggle = async (enabled: boolean) => {
    const ok = await run(() => withStepUp(() => unwrap(window.ci.settings.update({ updatesEnabled: enabled }))))
    if (ok) await qc.invalidateQueries({ queryKey: ['settings'] })
  }
  const check = async () => {
    const r = await run(() => unwrap(window.ci.updates.check()))
    if (r && (r.state === 'idle' || r.state === 'checking')) toast.success(t('updates.upToDate'))
  }

  const manualOnly = s?.state === 'disabled' && s.reason === 'not-configured'
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('updates.title')}</CardTitle>
        <CardDescription>
          {t('updates.current', { version: s?.currentVersion ?? '—' })} · {s ? t(`updates.states.${s.state}`, { version: s.version, percent: s.percent ?? 0 }) : ''}
        </CardDescription>
      </CardHeader>
      {manualOnly && !isAdmin ? (
        <CardContent className="text-sm text-muted-foreground">{t('updates.manualOnly')}</CardContent>
      ) : null}
      {isAdmin ? (
        <CardContent className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={settings?.updatesEnabled ?? true}
              disabled={pending || !settings}
              onChange={(e) => void toggle(e.target.checked)}
            />
            {t('updates.auto')}
          </label>
          <Button variant="outline" size="sm" disabled={pending || s?.state === 'disabled'} onClick={() => void check()}>
            <RefreshCw />
            {t('updates.checkNow')}
          </Button>
          {s?.state === 'disabled' ? (
            <span className="text-xs text-muted-foreground">{s.reason === 'not-configured' ? t('updates.manualOnly') : t('updates.devBuild')}</span>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
