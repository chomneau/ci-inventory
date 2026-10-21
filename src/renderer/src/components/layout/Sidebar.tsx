import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { CiLogo, CiSymbol } from '@renderer/components/brand/CiLogo'
import { cn } from '@renderer/lib/utils'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { useDashboard } from '@renderer/features/inventory/hooks'
import { useSettings } from '@renderer/features/admin/hooks'
import { NAV_SECTIONS } from './nav'

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const { role } = useCurrentUser()
  const lowStock = useDashboard().data?.lowStockCount ?? 0
  const office = useSettings().data?.officeName
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter(
    (s) => s.items.length > 0
  )
  return (
    <aside className={cn('flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-64')}>
      <div className={cn('flex h-16 items-center border-b', collapsed ? 'justify-center px-2' : 'px-5')}>
        {collapsed ? (
          <CiSymbol className="h-8" />
        ) : (
          <>
            <CiLogo variant="color" className="h-9 dark:hidden" subtitle={office} />
            <CiLogo variant="white" className="hidden h-9 dark:flex" subtitle={office} />
          </>
        )}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-3" aria-label={t('nav.main')}>
        {sections.map((section) => (
          <div key={section.titleKey}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
            ) : (
              <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(section.titleKey)}</div>
            )}
            <ul className="space-y-1">
              {section.items.map(({ to, labelKey, icon: Icon }) => {
                const showBadge = to === '/items' && lowStock > 0
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      title={collapsed ? t(labelKey) : undefined}
                      aria-label={collapsed ? t(labelKey) : undefined}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-lg py-2 text-sm transition-colors',
                          collapsed ? 'justify-center px-0' : 'px-3',
                          isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      {collapsed ? null : <span className="truncate">{t(labelKey)}</span>}
                      {showBadge && !collapsed ? (
                        <span
                          className="ml-auto rounded-full bg-red-500/12 px-1.5 text-xs font-medium tabular-nums text-red-600 dark:text-red-300"
                          title={t('dashboard.kpi.lowStock')}
                        >
                          {lowStock}
                        </span>
                      ) : null}
                      {showBadge && collapsed ? (
                        <span className="absolute right-2.5 top-1.5 size-2 rounded-full bg-[var(--status-critical)] ring-2 ring-sidebar" aria-label={t('dashboard.kpi.lowStock')} />
                      ) : null}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn('border-t p-3', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={onToggle}
          className={cn('flex items-center gap-3 rounded-lg py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground', collapsed ? 'px-2' : 'w-full px-3')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {collapsed ? null : t('nav.collapse')}
        </button>
      </div>
    </aside>
  )
}
