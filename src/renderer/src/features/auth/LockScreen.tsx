import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import type { PublicUser } from '@shared/auth'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { PasswordInput } from '@renderer/components/ui/password-input'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useAuth } from './AuthProvider'
import { initials } from './initials'
import { InventoryPattern } from './art/InventoryPattern'
import { KhmerFlower } from './art/KhmerFlower'

export function LockScreen({ user }: { user: PublicUser }) {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const { run, pending, error } = useAction({ INVALID_CREDENTIALS: t('auth.lock.wrongPassword') })
  const [password, setPassword] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const status = await run(() => unwrap(window.ci.auth.unlock({ password })))
    if (status) setStatus(status)
    else setPassword('')
  }

  return (
    <div className="bg-ci-gradient relative grid h-full place-items-center overflow-hidden p-6">
      <InventoryPattern className="pointer-events-none absolute inset-0 size-full text-white opacity-[0.09]" />
      <KhmerFlower className="animate-slow-spin pointer-events-none absolute -bottom-56 -left-56 size-[40rem] text-white/10" strokeWidth={0.7} />

      <form onSubmit={onSubmit} className="animate-rise-in relative w-full max-w-sm overflow-hidden rounded-2xl bg-card text-center shadow-2xl">
        <div className="space-y-5 p-8">
          <div className="relative mx-auto grid size-20 place-items-center rounded-full bg-ci-blue-deep text-2xl font-light text-white ring-4 ring-ci-blue/20">
            {initials(user.displayName)}
            <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-4 border-card bg-ci-green text-white">
              <Lock className="size-3.5" />
            </span>
          </div>
          <div>
            <div className="text-xl font-light">{user.displayName}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
          <p className="text-sm text-muted-foreground">{t('auth.lock.subtitle')}</p>
          {error ? <Alert>{error}</Alert> : null}
          <PasswordInput
            autoFocus
            required
            autoComplete="current-password"
            placeholder={t('auth.password')}
            aria-label={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={pending || !password}>
            {t('auth.lock.unlock')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void unwrap(window.ci.auth.logout()).then(setStatus)}>
            {t('auth.lock.switchUser')}
          </Button>
        </div>
        <div className="h-1.5 bg-ci-green" />
      </form>
    </div>
  )
}
