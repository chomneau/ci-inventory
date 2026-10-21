import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CiLogo } from '@renderer/components/brand/CiLogo'
import { cn } from '@renderer/lib/utils'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { useDashboard } from '@renderer/features/inventory/hooks'
import { useSettings } from '@renderer/features/admin/hooks'
import { NAV_SECTIONS } from './nav'

export function Sidebar() {
  const { t } = useTranslation()
  const { role } = useCurrentUser()
  const lowStock = useDashboard().data?.lowStockCount ?? 0
  const office = useSettings().data?.officeName
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter(
    (s) => s.items.length > 0
  )
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-16 items-center border-b px-5">
        <CiLogo variant="color" className="h-9 dark:hidden" subtitle={office} />
        <CiLogo variant="white" className="hidden h-9 dark:flex" subtitle={office} />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        {sections.map((section) => (
          <div key={section.titleKey}>
            <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(section.titleKey)}
            </div>
            <ul className="space-y-1">
              {section.items.map(({ to, labelKey, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )
                    }
                  >
                    <Icon className="size-4" />
                    {t(labelKey)}
                    {to === '/items' && lowStock > 0 ? (
                      <span className="ml-auto rounded-full bg-red-500/12 px-1.5 text-xs font-medium tabular-nums text-red-600 dark:text-red-300" title={t('dashboard.kpi.lowStock')}>
                        {lowStock}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
