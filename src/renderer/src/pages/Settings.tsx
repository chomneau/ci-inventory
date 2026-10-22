import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, DatabaseBackup, History, KeyRound, Languages, LockKeyhole, Monitor, Moon, Palette, RefreshCw, Settings as SettingsIcon, Sun, type LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Page, PageHeader } from '@renderer/components/ui/page'
import { LANGUAGES } from '@renderer/i18n'
import { useTheme, type Theme } from '@renderer/lib/theme'
import { cn } from '@renderer/lib/utils'
import { ChangePasswordCard } from '@renderer/features/auth/ChangePasswordCard'
import { ActivityCard, RecoveryCodesCard } from '@renderer/features/admin/SecurityCards'
import { BackupCard, OrganisationCard } from '@renderer/features/admin/AdminSettingsCards'
import { useIsAdmin } from '@renderer/features/admin/hooks'
import { UpdatesCard } from '@renderer/features/admin/updates'

const THEMES: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor }
]

interface Section {
  id: string
  group: 'general' | 'security' | 'admin'
  label: string
  icon: LucideIcon
  render: () => ReactNode
}

/**
 * Settings with a section menu: sticky on wide screens, a scrollable tab row on
 * narrow ones. The active section follows the scroll position.
 */
export function Settings() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const isAdmin = useIsAdmin()
  const [active, setActive] = useState('appearance')
  // While a menu click is smooth-scrolling, keep the clicked entry highlighted instead of every section passed on the way.
  const pinned = useRef<string | null>(null)

  const sections: Section[] = [
    {
      id: 'appearance',
      group: 'general',
      label: t('settings.appearance'),
      icon: Palette,
      render: () => (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
            <CardDescription>{t('settings.appearanceHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {THEMES.map(({ value, icon: Icon }) => (
              <Button key={value} variant={theme === value ? 'selected' : 'outline'} onClick={() => setTheme(value)}>
                <Icon />
                {t(`settings.theme.${value}`)}
              </Button>
            ))}
          </CardContent>
        </Card>
      )
    },
    {
      id: 'language',
      group: 'general',
      label: t('settings.language'),
      icon: Languages,
      render: () => (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
            <CardDescription>{t('settings.languageHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {LANGUAGES.map(({ code, label }) => (
              <Button key={code} variant={i18n.language === code ? 'selected' : 'outline'} onClick={() => void i18n.changeLanguage(code)}>
                {label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )
    },
    { id: 'updates', group: 'general', label: t('updates.title'), icon: RefreshCw, render: () => <UpdatesCard /> },
    { id: 'password', group: 'security', label: t('settings.security.title'), icon: LockKeyhole, render: () => <ChangePasswordCard /> },
    { id: 'recovery', group: 'security', label: t('security.recoveryTitle'), icon: KeyRound, render: () => <RecoveryCodesCard /> },
    { id: 'activity', group: 'security', label: t('security.activityTitle'), icon: History, render: () => <ActivityCard /> },
    ...(isAdmin
      ? ([
          { id: 'organisation', group: 'admin', label: t('adminSettings.title'), icon: Building2, render: () => <OrganisationCard /> },
          { id: 'backup', group: 'admin', label: t('backup.title'), icon: DatabaseBackup, render: () => <BackupCard /> }
        ] as Section[])
      : [])
  ]

  // Highlight the section currently in view: the last one whose top has passed the upper third of the
  // viewport, or the last section once the page is scrolled to the bottom (short final sections never reach the top).
  useEffect(() => {
    const root = document.querySelector('main')
    if (!root) return
    let frame = 0
    const pick = () => {
      frame = 0
      if (pinned.current) return
      const ids = sections.map((s) => s.id)
      const line = root.getBoundingClientRect().top + root.clientHeight / 3
      let current = ids[0]!
      for (const id of ids) {
        const el = document.getElementById(`settings-${id}`)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      if (root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) current = ids.at(-1)!
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick)
    }
    const release = () => {
      pinned.current = null
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    root.addEventListener('scrollend', release)
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('scroll', onScroll)
      root.removeEventListener('scrollend', release)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const go = (id: string) => {
    setActive(id)
    pinned.current = id
    window.setTimeout(() => (pinned.current = null), 1200) // fallback if no scroll happens (already in place)
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const groups: Section['group'][] = isAdmin ? ['general', 'security', 'admin'] : ['general', 'security']
  const groupLabel = (g: Section['group']) => t(`settings.sections.${g}`)

  return (
    <Page>
      <PageHeader icon={SettingsIcon} title={t('settings.title')} description={t('settings.subtitle')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @4xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={t('settings.title')} className="min-w-0 @4xl:sticky @4xl:top-0 @4xl:self-start">
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 @4xl:mx-0 @4xl:flex-col @4xl:overflow-visible @4xl:px-0">
            {groups.map((g) => (
              <div key={g} className="contents @4xl:block @4xl:pb-3">
                <div className="hidden px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground @4xl:block">{groupLabel(g)}</div>
                {sections
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(s.id)}
                      aria-current={active === s.id ? 'true' : undefined}
                      className={cn(
                        'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors @4xl:w-full',
                        active === s.id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <s.icon className="size-4 shrink-0" />
                      {s.label}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0 space-y-6">
          {groups.map((g) => (
            <div key={g} className="space-y-4">
              <h2 className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{groupLabel(g)}</h2>
              {sections
                .filter((s) => s.group === g)
                .map((s) => (
                  <section key={s.id} id={`settings-${s.id}`} className="scroll-mt-4">
                    {s.render()}
                  </section>
                ))}
            </div>
          ))}
        </div>
      </div>
    </Page>
  )
}
