import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardCopy,
  Minus,
  PackageCheck,
  TriangleAlert
} from 'lucide-react'
import { toast } from 'sonner'
import type { InventoryAnalytics } from '@shared/inventory'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { BarList } from '@renderer/components/charts/BarList'
import { ChartCard, DataTable } from '@renderer/components/charts/ChartCard'
import { LineChart } from '@renderer/components/charts/LineChart'
import { SegmentMeter } from '@renderer/components/charts/SegmentMeter'
import { Sparkline } from '@renderer/components/charts/Sparkline'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { BackupReminder } from '@renderer/features/admin/AdminSettingsCards'
import { useCanWrite, useDashboard, useLocations } from '@renderer/features/inventory/hooks'
import { MovementDialog, type MovementKind } from '@renderer/features/inventory/MovementDialog'
import { MovementBadge, SignedQuantity } from '@renderer/features/inventory/parts'
import { useFormat } from '@renderer/lib/format'
import { unwrap } from '@renderer/lib/ipc'
import { cn, readPreference, writePreference } from '@renderer/lib/utils'

type Days = 7 | 30 | 90
const RANGES: Days[] = [7, 30, 90]

function useDashboardFormat() {
  const { i18n } = useTranslation()
  const f = useFormat()
  const loc = i18n.language === 'km' ? 'km-KH' : 'en-US'
  const compactMoney = new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
  const day = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' })
  return {
    ...f,
    compactMoney: (cents: number) => compactMoney.format(cents / 100),
    day: (key: string) => {
      const [y, m, d] = key.split('-').map(Number)
      return day.format(new Date(y!, m! - 1, d!))
    }
  }
}

/** Signed change vs the previous period. Neutral ink: more stock movement is neither good nor bad. */
function Delta({ now, before, days }: { now: number; before: number; days: number }) {
  const { t } = useTranslation()
  if (before === 0 && now === 0) return <span className="text-xs text-muted-foreground">{t('dash.noChange', { days })}</span>
  if (before === 0) return <span className="text-xs text-muted-foreground">{t('dash.newVsPrevious', { days })}</span>
  const pct = Math.round(((now - before) / before) * 100)
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="font-medium text-foreground tabular-nums">{pct > 0 ? `+${pct}` : pct}%</span>
      {t('dash.vsPrevious', { days })}
    </span>
  )
}

function StatTile({
  label,
  value,
  footer,
  trend,
  accent,
  to,
  icon
}: {
  label: string
  value: string
  footer: React.ReactNode
  trend?: number[]
  accent?: string
  to?: string
  icon?: React.ReactNode
}) {
  const body = (
    <div className={cn('flex h-full flex-col justify-between gap-3 rounded-xl border bg-card p-5 shadow-xs transition-shadow', to && 'hover:shadow-md')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[1.75rem] font-semibold leading-none tracking-tight">{value}</span>
        {trend ? <Sparkline values={trend} accent={accent} /> : null}
      </div>
      <div>{footer}</div>
    </div>
  )
  return to ? <Link to={to} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">{body}</Link> : body
}

export function Dashboard() {
  const { t } = useTranslation()
  const fmt = useDashboardFormat()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const canWrite = useCanWrite()
  const [days, setDaysState] = useState<Days>(() => (Number(readPreference('ci.dash.days')) as Days) || 30)
  const [locationId, setLocationId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<{ kind: MovementKind; itemId?: number } | null>(null)
  const { data: locations = [] } = useLocations()
  const { data: recent } = useDashboard()
  const { data, isFetching } = useQuery({
    queryKey: ['analytics', days, locationId],
    queryFn: () => unwrap(window.ci.dashboard.analytics({ days, locationId })),
    placeholderData: keepPreviousData
  })

  const setDays = (d: Days) => {
    writePreference('ci.dash.days', String(d))
    setDaysState(d)
  }

  const a: InventoryAnalytics | undefined = data
  const labels = a?.series.map((p) => fmt.day(p.day)) ?? []
  const dimmed = isFetching && !!a
  const blue = 'var(--series-1)'
  const green = 'var(--series-2)'

  const copyReorder = async () => {
    if (!a) return
    const head = ['SKU', 'Item', 'On hand', 'Minimum', 'Suggested order', 'Unit', 'Estimated cost (USD)']
    const lines = a.reorder.map((r) => [r.sku, r.nameEn, r.onHand, r.minStock, r.suggestedQuantity, r.unit, (r.estimatedCostCents / 100).toFixed(2)].join('\t'))
    await navigator.clipboard.writeText([head.join('\t'), ...lines].join('\n'))
    toast.success(t('dash.reorderCopied'))
  }

  return (
    <div className="@container mx-auto w-full max-w-[1600px] space-y-5">
      {/* Header + quick actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">{t('dashboard.welcomeUser', { name: user.displayName.split(' ')[0] })}</h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog({ kind: 'in' })}>
              <ArrowDownToLine />
              {t('stock.actions.in')}
            </Button>
            <Button variant="outline" onClick={() => setDialog({ kind: 'out' })}>
              <ArrowUpFromLine />
              {t('stock.actions.out')}
            </Button>
            <Button variant="outline" onClick={() => setDialog({ kind: 'transfer' })}>
              <ArrowLeftRight />
              {t('stock.actions.transfer')}
            </Button>
          </div>
        ) : null}
      </div>

      {user.role === 'admin' ? <BackupReminder /> : null}

      {/* One filter row scopes everything below it */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label={t('dash.period')} className="inline-flex rounded-lg border bg-card p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                days === d ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('dash.lastDays', { count: d })}
            </button>
          ))}
        </div>
        <div className="w-56">
          <Select value={locationId ?? ''} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)} aria-label={t('stock.fields.location')}>
            <option value="">{t('dash.allLocations')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        {isFetching ? <span className="text-xs text-muted-foreground">{t('dash.updating')}</span> : null}
      </div>

      {/* KPI row */}
      <div className={cn('grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-4 transition-opacity', dimmed && 'opacity-60')}>
        <StatTile
          label={t('dashboard.kpi.stockValue')}
          value={a ? fmt.money(a.stockValueCents) : '—'}
          trend={a?.series.map((p) => p.stockValueCents)}
          footer={<span className="text-xs text-muted-foreground">{a ? t('dash.itemsInScope', { count: a.health.ok + a.health.low + a.health.out }) : ''}</span>}
        />
        <StatTile
          label={t('dash.received')}
          value={a ? fmt.money(a.current.receivedCents) : '—'}
          trend={a?.series.map((p) => p.receivedCents)}
          accent={blue}
          footer={a ? <Delta now={a.current.receivedCents} before={a.previous.receivedCents} days={days} /> : null}
          to="/stock"
        />
        <StatTile
          label={t('dash.issued')}
          value={a ? fmt.money(a.current.issuedCents) : '—'}
          trend={a?.series.map((p) => p.issuedCents)}
          accent={green}
          footer={a ? <Delta now={a.current.issuedCents} before={a.previous.issuedCents} days={days} /> : null}
          to="/stock"
        />
        <StatTile
          label={t('dash.needReorder')}
          value={a ? fmt.number(a.reorder.length) : '—'}
          icon={
            a && a.health.out > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--status-critical)]">
                <CircleX className="size-3.5" /> {t('dash.outCount', { count: a.health.out })}
              </span>
            ) : null
          }
          footer={<span className="text-xs text-muted-foreground">{t('dash.movementsInPeriod', { count: a?.current.movements ?? 0 })}</span>}
          to="/items?low=1"
        />
      </div>

      {/* Trend + health */}
      <div className="grid gap-4 @5xl:grid-cols-3">
        <ChartCard
          className="@5xl:col-span-2"
          title={t('dash.flowTitle')}
          subtitle={t('dash.flowSubtitle', { days })}
          legend={[
            { label: t('dash.received'), color: blue, shape: 'line' },
            { label: t('dash.issued'), color: green, shape: 'line' }
          ]}
          dimmed={dimmed}
          table={
            a ? (
              <DataTable
                head={[t('stock.fields.date'), t('dash.received'), t('dash.issued'), t('dash.movements')]}
                rows={a.series.map((p) => [fmt.day(p.day), fmt.money(p.receivedCents), fmt.money(p.issuedCents), p.movements])}
              />
            ) : undefined
          }
        >
          {a ? (
            <LineChart
              ariaLabel={t('dash.flowTitle')}
              labels={labels}
              formatValue={fmt.money}
              formatTick={fmt.compactMoney}
              series={[
                { key: 'received', label: t('dash.received'), color: blue, values: a.series.map((p) => p.receivedCents) },
                { key: 'issued', label: t('dash.issued'), color: green, values: a.series.map((p) => p.issuedCents) }
              ]}
            />
          ) : (
            <div className="h-[232px] animate-pulse rounded-lg bg-muted" />
          )}
        </ChartCard>

        <ChartCard title={t('dash.healthTitle')} subtitle={t('dash.healthSubtitle')} dimmed={dimmed}>
          {a ? (
            <SegmentMeter
              formatValue={fmt.number}
              segments={[
                { key: 'ok', label: t('dash.healthOk'), value: a.health.ok, color: 'var(--status-good)', icon: CircleCheck },
                { key: 'low', label: t('dash.healthLow'), value: a.health.low, color: 'var(--status-warning)', icon: TriangleAlert, onClick: () => navigate('/items?low=1') },
                { key: 'out', label: t('dash.healthOut'), value: a.health.out, color: 'var(--status-critical)', icon: CircleAlert, onClick: () => navigate('/items?low=1') }
              ]}
            />
          ) : null}
          {a ? (
            <div className="mt-5 rounded-lg bg-muted/60 p-4">
              <div className="text-xs text-muted-foreground">{t('dash.reorderBudget')}</div>
              <div className="mt-1 text-xl font-semibold">{fmt.money(a.reorder.reduce((sum, r) => sum + r.estimatedCostCents, 0))}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t('dash.reorderBudgetHint', { count: a.reorder.length })}</div>
              {a.reorder.length > 0 ? (
                <Link to="/items?low=1" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                  {t('dash.viewLowItems')} →
                </Link>
              ) : null}
            </div>
          ) : null}
        </ChartCard>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <ChartCard
          title={t('dash.topIssuedTitle')}
          subtitle={t('dash.byValue', { days })}
          dimmed={dimmed}
          table={a ? <DataTable head={[t('items.fields.item'), t('stock.fields.quantity'), t('items.fields.value')]} rows={a.topIssued.map((i) => [fmt.name(i), `${fmt.number(i.quantity)} ${i.unit}`, fmt.money(i.valueCents)])} /> : undefined}
        >
          <BarList
            emptyText={t('dash.noIssues')}
            formatValue={fmt.money}
            rows={(a?.topIssued ?? []).map((i) => ({
              id: i.itemId,
              label: fmt.name(i),
              sublabel: i.sku,
              value: i.valueCents,
              detail: `${fmt.number(i.quantity)} ${i.unit}`,
              onClick: () => navigate(`/items/${i.itemId}`)
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t('dash.issuedToTitle')}
          subtitle={t('dash.byValue', { days })}
          dimmed={dimmed}
          table={a ? <DataTable head={[t('stock.fields.issuedTo'), t('dash.issues'), t('items.fields.value')]} rows={a.issuedTo.map((r) => [r.recipient ?? t('dash.unspecified'), r.movements, fmt.money(r.valueCents)])} /> : undefined}
        >
          <BarList
            emptyText={t('dash.noIssues')}
            formatValue={fmt.money}
            rows={(a?.issuedTo ?? []).map((r) => ({
              id: r.recipient ?? '—',
              label: r.recipient ?? t('dash.unspecified'),
              value: r.valueCents,
              detail: t('dash.issueCount', { count: r.movements })
            }))}
          />
        </ChartCard>

        <ChartCard
          className="@3xl:col-span-2 @6xl:col-span-1"
          title={t('dash.byCategoryTitle')}
          subtitle={t('dash.byCategorySubtitle')}
          dimmed={dimmed}
          table={a ? <DataTable head={[t('items.fields.category'), t('categories.items'), t('items.fields.value')]} rows={a.valueByCategory.map((c) => [c.nameEn ? fmt.name(c) : t('items.uncategorised'), c.items, fmt.money(c.valueCents)])} /> : undefined}
        >
          <BarList
            emptyText={t('dash.noStock')}
            formatValue={fmt.money}
            rows={(a?.valueByCategory ?? []).map((c) => ({
              id: c.categoryId ?? 'none',
              label: c.nameEn ? fmt.name(c) : t('items.uncategorised'),
              value: c.valueCents,
              detail: t('dash.itemsCount', { count: c.items })
            }))}
          />
        </ChartCard>
      </div>

      {/* Reorder list + latest activity */}
      <div className="grid gap-4 @5xl:grid-cols-5">
        <ChartCard
          className="@5xl:col-span-3"
          title={t('dash.reorderTitle')}
          subtitle={t('dash.reorderSubtitle')}
          dimmed={dimmed}
          action={
            a && a.reorder.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => void copyReorder()}>
                <ClipboardCopy />
                {t('dash.copyList')}
              </Button>
            ) : null
          }
        >
          {a && a.reorder.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <PackageCheck className="size-4 text-[var(--status-good)]" />
              {t('dashboard.allStocked')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="border-b px-2 py-2 text-left font-medium">{t('items.fields.item')}</th>
                    <th className="border-b px-2 py-2 text-right font-medium">{t('items.fields.onHand')}</th>
                    <th className="border-b px-2 py-2 text-right font-medium">{t('dash.suggested')}</th>
                    <th className="border-b px-2 py-2 text-right font-medium">{t('dash.estCost')}</th>
                    {canWrite ? <th className="border-b px-2 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(a?.reorder ?? []).map((r) => (
                    <tr key={r.itemId} className="hover:bg-muted/40">
                      <td className="border-b px-2 py-2">
                        <Link to={`/items/${r.itemId}`} className="font-medium hover:underline">
                          {fmt.name(r)}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                      </td>
                      <td className="border-b px-2 py-2 text-right tabular-nums">
                        <span className={r.onHand <= 0 ? 'font-medium text-[var(--status-critical)]' : ''}>{fmt.number(r.onHand)}</span>
                        <span className="text-muted-foreground"> / {fmt.number(r.minStock)}</span>
                      </td>
                      <td className="border-b px-2 py-2 text-right tabular-nums">
                        {fmt.number(r.suggestedQuantity)} <span className="text-muted-foreground">{r.unit}</span>
                      </td>
                      <td className="border-b px-2 py-2 text-right tabular-nums">{fmt.money(r.estimatedCostCents)}</td>
                      {canWrite ? (
                        <td className="border-b px-2 py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'in', itemId: r.itemId })}>
                            <ArrowDownToLine />
                            {t('dash.receive')}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                {a && a.reorder.length > 1 ? (
                  <tfoot>
                    <tr>
                      <td className="px-2 py-2 text-xs text-muted-foreground" colSpan={3}>
                        {t('dash.reorderTotal', { count: a.reorder.length })}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{fmt.money(a.reorder.reduce((s, r) => s + r.estimatedCostCents, 0))}</td>
                      {canWrite ? <td /> : null}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard
          className="@5xl:col-span-2"
          title={t('dashboard.recent')}
          action={
            <Link to="/stock" className="text-sm text-primary hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {recent && recent.recentMovements.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{t('stock.empty')}</p>
          ) : (
            <ul className="divide-y">
              {(recent?.recentMovements ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <MovementBadge type={m.type} />
                  <Link to={`/items/${m.itemId}`} className="min-w-0 flex-1 truncate hover:underline">
                    {fmt.name({ nameEn: m.itemNameEn, nameKm: m.itemNameKm })}
                    <span className="text-muted-foreground"> · {m.locationName}</span>
                  </Link>
                  <SignedQuantity value={m.quantity} unit={m.unit} />
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {dialog ? <MovementDialog open onOpenChange={(o) => !o && setDialog(null)} kind={dialog.kind} itemId={dialog.itemId} /> : null}
    </div>
  )
}
