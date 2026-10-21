import { useTranslation } from 'react-i18next'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { LANGUAGES } from '@renderer/i18n'
import { useTheme, type Theme } from '@renderer/lib/theme'
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

export function Settings() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const isAdmin = useIsAdmin()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language')}</CardTitle>
          <CardDescription>{t('settings.languageHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LANGUAGES.map(({ code, label }) => (
            <Button
              key={code}
              variant={i18n.language === code ? 'selected' : 'outline'}
              onClick={() => void i18n.changeLanguage(code)}
            >
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <UpdatesCard />

      <h3 className="pt-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('settings.sections.security')}</h3>
      <ChangePasswordCard />
      <RecoveryCodesCard />
      <ActivityCard />

      {isAdmin ? (
        <>
          <h3 className="pt-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('settings.sections.admin')}</h3>
          <OrganisationCard />
          <BackupCard />
        </>
      ) : null}
    </div>
  )
}
