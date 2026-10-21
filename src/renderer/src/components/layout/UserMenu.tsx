import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Lock, LogOut } from 'lucide-react'
import { useAuth, useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { initials } from '@renderer/features/auth/initials'
import { unwrap } from '@renderer/lib/ipc'

const isMac = navigator.userAgent.includes('Mac')

export function UserMenu() {
  const { t } = useTranslation()
  const { setStatus } = useAuth()
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const lock = () => void unwrap(window.ci.auth.lock()).then(setStatus)
  const logout = () => void unwrap(window.ci.auth.logout()).then(setStatus)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-muted"
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(user.displayName)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium">{user.displayName}</span>
          <span className="block text-xs text-muted-foreground">{t(`roles.${user.role}`)}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 rounded-xl border bg-card p-1 shadow-lg">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium">{user.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-border" />
          <button role="menuitem" onClick={lock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
            <Lock className="size-4" />
            {t('auth.menu.lock')}
            <kbd className="ml-auto text-xs text-muted-foreground">{isMac ? '⌘L' : 'Ctrl+L'}</kbd>
          </button>
          <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
            <LogOut className="size-4" />
            {t('auth.menu.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
