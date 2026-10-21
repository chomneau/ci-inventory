import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, DollarSign, Package, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { useCanWrite, useDashboard } from '@renderer/features/inventory/hooks'
import { MovementDialog, type MovementKind } from '@renderer/features/inventory/MovementDialog'
import { MovementBadge, SignedQuantity } from '@renderer/features/inventory/parts'
import { useFormat } from '@renderer/lib/format'
import { BackupReminder } from '@renderer/features/admin/AdminSettingsCards'
import { cn } from '@renderer/lib/utils'

function Kpi({ label, value, icon: Icon, tone, to }: { label: string; value: string; icon: LucideIcon; tone?: 'red'; to?: string }) {
  const body = (
    <Card className={cn('h-full transition-shadow', to && 'hover:shadow-md')}>
      <CardHeader className="flex-row items-center justify-between">
        <CardDescription>{label}</CardDescription>
        <span className={cn('grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground', tone === 'red' && 'bg-red-500/10 text-red-600 dark:text-red-300')}>
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className={cn('text-3xl font-light tabular-nums', tone === 'red' && 'text-red-600 dark:text-red-300')}>{value}</div>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

export function Dashboard() {
  const { t } = useTranslation()
  const { money, number, name, dateTime } = useFormat()
  const user = useCurrentUser()
  const canWrite = useCanWrite()
  const { data } = useDashboard()
  const [dialog, setDialog] = useState<MovementKind | null>(null)
  const dash = (v: number | undefined, f: (n: number) => string) => (v === undefined ? '—' : f(v))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">{t('dashboard.welcomeUser', { name: user.displayName.split(' ')[0] })}</h2>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Button onClick={() => setDialog('in')}>
              <ArrowDownToLine />
              {t('stock.actions.in')}
            </Button>
            <Button variant="outline" onClick={() => setDialog('out')}>
              <ArrowUpFromLine />
              {t('stock.actions.out')}
            </Button>
            <Button variant="outline" onClick={() => setDialog('transfer')}>
              <ArrowLeftRight />
              {t('stock.actions.transfer')}
            </Button>
          </div>
        ) : null}
      </div>

      {user.role === 'admin' ? <BackupReminder /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('dashboard.kpi.totalItems')} value={dash(data?.totalItems, number)} icon={Package} to="/items" />
        <Kpi
          label={t('dashboard.kpi.lowStock')}
          value={dash(data?.lowStockCount, number)}
          icon={AlertTriangle}
          tone={data?.lowStockCount ? 'red' : undefined}
          to="/items?low=1"
        />
        <Kpi label={t('dashboard.kpi.stockValue')} value={dash(data?.stockValueCents, money)} icon={DollarSign} />
        <Kpi label={t('dashboard.kpi.movementsToday')} value={dash(data?.movementsToday, number)} icon={ArrowLeftRight} to="/stock" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.needsRestock')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.lowStock.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-ci-green" />
                {t('dashboard.allStocked')}
              </p>
            ) : (
              <ul className="divide-y">
                {(data?.lowStock ?? []).map((i) => (
                  <li key={i.id}>
                    <Link to={`/items/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{name(i)}</div>
                        <div className="font-mono text-xs text-muted-foreground">{i.sku}</div>
                      </div>
                      <div className="text-right text-sm">
                        <span className="font-medium text-red-600 tabular-nums dark:text-red-300">{number(i.onHand)}</span>
                        <span className="text-muted-foreground"> / {number(i.minStock)} {i.unit}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('dashboard.recent')}</CardTitle>
            <Link to="/stock" className="text-sm text-primary hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          </CardHeader>
          <CardContent>
            {data && data.recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('stock.empty')}</p>
            ) : (
              <ul className="divide-y">
                {(data?.recentMovements ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <MovementBadge type={m.type} />
                    <Link to={`/items/${m.itemId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {name({ nameEn: m.itemNameEn, nameKm: m.itemNameKm })}
                      <span className="text-muted-foreground"> · {m.locationName}</span>
                    </Link>
                    <SignedQuantity value={m.quantity} unit={m.unit} />
                    <span className="hidden w-36 text-right text-xs text-muted-foreground md:block">{dateTime(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog ? <MovementDialog open onOpenChange={(o) => !o && setDialog(null)} kind={dialog} /> : null}
    </div>
  )
}
