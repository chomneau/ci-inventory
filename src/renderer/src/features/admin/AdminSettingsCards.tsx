import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, FileUp, RotateCcw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { BackupSummary } from '@shared/admin'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { PasswordInput } from '@renderer/components/ui/password-input'
import { isPasswordAcceptable, PasswordChecklist } from '@renderer/features/auth/PasswordChecklist'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useStepUp } from '@renderer/lib/step-up'
import { useSettings } from './hooks'

/** Organisation-wide policies (admins). */
export function OrganisationCard() {
  const { t } = useTranslation()
  const withStepUp = useStepUp()
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { run, pending, error } = useAction()
  const [idle, setIdle] = useState('')
  const [office, setOffice] = useState('')
  const [reminder, setReminder] = useState('')

  useEffect(() => {
    if (!settings) return
    setIdle(String(settings.idleLockMinutes))
    setOffice(settings.officeName)
    setReminder(String(settings.backupReminderDays))
  }, [settings])

  const idleN = Number(idle)
  const reminderN = Number(reminder)
  const valid = idleN >= 1 && idleN <= 240 && reminderN >= 1 && reminderN <= 90 && office.trim().length > 0

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(() =>
      withStepUp(() => unwrap(window.ci.settings.update({ idleLockMinutes: idleN, officeName: office.trim(), backupReminderDays: reminderN })))
    )
    if (ok) {
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success(t('common.saved'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('adminSettings.title')}</CardTitle>
        <CardDescription>{t('adminSettings.hint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-xl gap-4 sm:grid-cols-2">
          {error ? (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <Field label={t('adminSettings.office')} htmlFor="s-office" hint={t('adminSettings.officeHint')}>
            <Input id="s-office" maxLength={120} value={office} onChange={(e) => setOffice(e.target.value)} />
          </Field>
          <Field label={t('adminSettings.idle')} htmlFor="s-idle" hint={t('adminSettings.idleHint')}>
            <Input id="s-idle" inputMode="numeric" value={idle} onChange={(e) => setIdle(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
          <Field label={t('adminSettings.reminder')} htmlFor="s-reminder" hint={t('adminSettings.reminderHint')}>
            <Input id="s-reminder" inputMode="numeric" value={reminder} onChange={(e) => setReminder(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending || !valid}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Encrypted backup and restore (admins). */
export function BackupCard() {
  const { t } = useTranslation()
  const { dateTime, number } = useFormat()
  const withStepUp = useStepUp()
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const backup = useAction()
  const restore = useAction({ BACKUP_PASSWORD: t('backup.wrongPassword') })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [restarting, setRestarting] = useState(false)

  const onBackup = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return backup.setError(t('auth.passwordsDontMatch'))
    const result = await backup.run(() => withStepUp(() => unwrap(window.ci.backup.create({ password }))))
    if (result?.saved) {
      setPassword('')
      setConfirm('')
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success(t('backup.saved', { file: result.fileName }))
    }
  }

  const onInspect = async (e: FormEvent) => {
    e.preventDefault()
    const result = await restore.run(() => unwrap(window.ci.backup.inspect({ password: restorePassword })))
    setRestorePassword('')
    if (result) setSummary(result)
  }

  const onApply = async () => {
    if (!summary) return
    const ok = await restore.run(async () => {
      await withStepUp(() => unwrap(window.ci.backup.apply({ token: summary.token })))
      return true
    })
    if (ok) setRestarting(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backup.title')}</CardTitle>
        <CardDescription>
          {settings?.lastBackupAt ? t('backup.last', { when: dateTime(settings.lastBackupAt) }) : t('backup.never')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={onBackup} className="space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <DatabaseBackup className="size-4 text-ci-blue" />
            {t('backup.create')}
          </div>
          <p className="text-sm text-muted-foreground">{t('backup.createHint')}</p>
          {backup.error ? <Alert>{backup.error}</Alert> : null}
          <Field label={t('backup.password')} htmlFor="b-pw" hint={<PasswordChecklist password={password} />}>
            <PasswordInput id="b-pw" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t('auth.confirmPassword')} htmlFor="b-pw2">
            <PasswordInput id="b-pw2" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" disabled={backup.pending || !isPasswordAcceptable(password) || !confirm}>
            <DatabaseBackup />
            {t('backup.createButton')}
          </Button>
        </form>

        <form onSubmit={onInspect} className="space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <RotateCcw className="size-4 text-ci-blue" />
            {t('backup.restore')}
          </div>
          <p className="text-sm text-muted-foreground">{t('backup.restoreHint')}</p>
          {restore.error && !summary ? <Alert>{restore.error}</Alert> : null}
          <Field label={t('backup.password')} htmlFor="r-pw">
            <PasswordInput id="r-pw" autoComplete="off" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" disabled={restore.pending || !restorePassword}>
            <FileUp />
            {t('backup.chooseFile')}
          </Button>
        </form>
      </CardContent>

      <Dialog
        open={summary !== null}
        onOpenChange={(o) => {
          if (!o && !restarting) {
            void window.ci.backup.cancel()
            setSummary(null)
          }
        }}
        title={restarting ? t('backup.restarting') : t('backup.confirmTitle')}
        footer={
          restarting ? undefined : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  void window.ci.backup.cancel()
                  setSummary(null)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button className="bg-red-600 hover:bg-red-600/90" disabled={restore.pending} onClick={() => void onApply()}>
                <RotateCcw />
                {t('backup.confirmButton')}
              </Button>
            </>
          )
        }
      >
        {summary ? (
          <div className="space-y-4 text-sm">
            {restore.error ? <Alert>{restore.error}</Alert> : null}
            <Alert variant="success">{t('backup.verified')}</Alert>
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-muted-foreground">{t('backup.createdAt')}</dt>
              <dd>{dateTime(summary.createdAt)}</dd>
              <dt className="text-muted-foreground">{t('backup.contents')}</dt>
              <dd>
                {t('backup.counts', {
                  items: number(summary.counts.items),
                  movements: number(summary.counts.movements),
                  users: number(summary.counts.users)
                })}
              </dd>
            </dl>
            {restarting ? (
              <p className="text-muted-foreground">{t('backup.restartingBody')}</p>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {t('backup.confirmWarning')}
              </div>
            )}
          </div>
        ) : null}
      </Dialog>
    </Card>
  )
}

/** Dashboard notice for admins when the last backup is too old. */
export function BackupReminder() {
  const { t } = useTranslation()
  const { data: s } = useSettings()
  if (!s) return null
  const days = s.lastBackupAt ? Math.floor((Date.now() - s.lastBackupAt) / 86_400_000) : null
  if (days !== null && days < s.backupReminderDays) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <TriangleAlert className="size-4" />
      <span className="flex-1">{days === null ? t('backup.reminderNever') : t('backup.reminderOld', { count: days })}</span>
      <a href="#/settings" className="font-medium underline">
        {t('backup.reminderAction')}
      </a>
    </div>
  )
}
