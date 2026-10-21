import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Languages, Moon, Sun } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useTheme } from '@renderer/lib/theme'
import { ALL_NAV_ITEMS } from './nav'
import { UserMenu } from './UserMenu'

export function Topbar() {
  const { t, i18n } = useTranslation()
  const { isDark, setTheme } = useTheme()
  const { pathname } = useLocation()
  const current = ALL_NAV_ITEMS.find((item) => item.to === pathname || (item.to !== '/' && pathname.startsWith(`${item.to}/`)))

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card/60 px-6 backdrop-blur">
      <h1 className="text-lg font-semibold">{current ? t(current.labelKey) : ''}</h1>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label={t('topbar.language')}
          onClick={() => void i18n.changeLanguage(i18n.language === 'km' ? 'en' : 'km')}
        >
          <Languages />
          {i18n.language === 'km' ? 'English' : 'ខ្មែរ'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('topbar.toggleTheme')}
          title={t('topbar.toggleTheme')}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun /> : <Moon />}
        </Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <UserMenu />
      </div>
    </header>
  )
}
