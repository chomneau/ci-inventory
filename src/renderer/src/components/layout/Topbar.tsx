import { Link, useLocation, useMatch } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Languages, Moon, Search, Sun } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useItem } from '@renderer/features/inventory/hooks'
import { useFormat } from '@renderer/lib/format'
import { useTheme } from '@renderer/lib/theme'
import { NAV_SECTIONS } from './nav'
import { UserMenu } from './UserMenu'

const isMac = navigator.userAgent.includes('Mac')

/** Where am I: section › page › record. */
function Breadcrumbs() {
  const { t } = useTranslation()
  const { name } = useFormat()
  const { pathname } = useLocation()
  const itemMatch = useMatch('/items/:id')
  const { data: item } = useItem(Number(itemMatch?.params.id ?? 0))
  const section = NAV_SECTIONS.find((s) => s.items.some((i) => i.to === pathname || (i.to !== '/' && pathname.startsWith(`${i.to}/`))))
  const page = section?.items.find((i) => i.to === pathname || (i.to !== '/' && pathname.startsWith(`${i.to}/`)))
  if (!section || !page) return null
  return (
    <nav aria-label={t('nav.breadcrumbs')} className="flex min-w-0 items-center gap-1.5 text-sm">
      {section.titleKey !== 'nav.main' ? (
        <>
          <span className="hidden text-muted-foreground sm:inline">{t(section.titleKey)}</span>
          <ChevronRight className="hidden size-3.5 text-muted-foreground sm:block" />
        </>
      ) : null}
      {itemMatch ? (
        <>
          <Link to={page.to} className="text-muted-foreground hover:text-foreground">
            {t(page.labelKey)}
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="truncate font-medium">{item ? name(item) : '…'}</span>
        </>
      ) : (
        <span className="truncate font-medium">{t(page.labelKey)}</span>
      )}
    </nav>
  )
}

export function Topbar({ onSearch }: { onSearch: () => void }) {
  const { t, i18n } = useTranslation()
  const { isDark, setTheme } = useTheme()

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-card/70 px-4 backdrop-blur md:px-6">
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 w-56 items-center gap-2 rounded-lg border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground max-[1100px]:w-9 max-[1100px]:justify-center max-[1100px]:px-0"
        aria-label={t('palette.open')}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left max-[1100px]:hidden">{t('palette.search')}</span>
        <kbd className="rounded border px-1.5 text-[10px] max-[1100px]:hidden">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('topbar.language')}
          title={t('topbar.language')}
          onClick={() => void i18n.changeLanguage(i18n.language === 'km' ? 'en' : 'km')}
        >
          <Languages />
          <span className="max-[1100px]:hidden">{i18n.language === 'km' ? 'English' : 'ខ្មែរ'}</span>
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('topbar.toggleTheme')} title={t('topbar.toggleTheme')} onClick={() => setTheme(isDark ? 'light' : 'dark')}>
          {isDark ? <Sun /> : <Moon />}
        </Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <UserMenu />
      </div>
    </header>
  )
}
