import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpFromLine,
  ClipboardCheck,
  ImagePlus,
  Pencil,
  QrCode,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { EmptyState, Page, Table, Td, Th } from '@renderer/components/ui/page'
import { ChartCard, DataTable } from '@renderer/components/charts/ChartCard'
import { LineChart } from '@renderer/components/charts/LineChart'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useErrorText } from '@renderer/lib/ipc'
import { useCanWrite, useItem, useMovements, usePhoto } from './hooks'
import { ItemFormDialog } from './ItemFormDialog'
import { LabelDialog } from './LabelDialog'
import { MovementDialog, type MovementKind } from './MovementDialog'
import { ConfirmDialog, ItemThumb, MovementBadge, SignedQuantity } from './parts'

export function ItemDetailPage() {
  const { t } = useTranslation()
  const { money, number, name, dateTime } = useFormat()
  const errorText = useErrorText()
  const canWrite = useCanWrite()
  const id = Number(useParams().id)
  const { data: item, error } = useItem(id)
  const { data: photo } = usePhoto(id, 'image', Boolean(item?.hasPhoto))
  const { data: movements = [] } = useMovements({ itemId: id, limit: 500 })
  const { i18n } = useTranslation()
  // Stock level at the end of each of the last 90 days, walked back from today's level.
  const trend = useMemo(() => {
    if (!item) return null
    const DAY = 86_400_000
    const end = new Date()
    end.setHours(24, 0, 0, 0)
    const days = 90
    const deltas = new Array<number>(days).fill(0)
    for (const m of movements) {
      const idx = days - 1 - Math.floor((end.getTime() - 1 - m.createdAt) / DAY)
      if (idx >= 0 && idx < days) deltas[idx]! += m.quantity
    }
    const values = new Array<number>(days)
    let level = item.onHand
    for (let i = days - 1; i >= 0; i--) {
      values[i] = level
      level -= deltas[i]!
    }
    const fmt = new Intl.DateTimeFormat(i18n.language === 'km' ? 'km-KH' : 'en-US', { day: 'numeric', month: 'short' })
    const labels = values.map((_, i) => fmt.format(new Date(end.getTime() - (days - i) * DAY)))
    return { values, labels }
  }, [item, movements, i18n.language])
  const [movement, setMovement] = useState<MovementKind | null>(null)
  const [editing, setEditing] = useState(false)
  const [labels, setLabels] = useState(false)
  const [archiving, setArchiving] = useState(false)

  if (error) return <EmptyState icon={Archive} title={errorText(error)} action={<Link to="/items" className="text-sm text-primary underline">{t('items.backToList')}</Link>} />
  if (!item) return <div className="h-40 animate-pulse rounded-xl bg-muted" />

  const run = (fn: () => Promise<unknown>, ok?: string) =>
    fn()
      .then(() => ok && toast.success(ok))
      .catch((e: unknown) => toast.error(errorText(e)))

  const actions: { kind: MovementKind; icon: typeof ArrowDownToLine }[] = [
    { kind: 'in', icon: ArrowDownToLine },
    { kind: 'out', icon: ArrowUpFromLine },
    { kind: 'transfer', icon: ArrowLeftRight },
    { kind: 'adjust', icon: ClipboardCheck }
  ]

  return (
    <Page>
      <Link to="/items" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t('items.backToList')}
      </Link>

      <div className="flex flex-wrap gap-6 rounded-2xl border bg-card p-6 shadow-xs">
        <div className="relative">
          {photo ? <img src={photo} alt="" className="size-36 rounded-xl border object-cover" /> : <ItemThumb item={item} className="size-36 [&_svg]:size-10" />}
          {canWrite ? (
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void run(() => unwrap(window.ci.items.choosePhoto({ id })))}>
                <ImagePlus />
                {item.hasPhoto ? t('items.changePhoto') : t('items.addPhoto')}
              </Button>
              {item.hasPhoto ? (
                <Button size="icon" variant="ghost" aria-label={t('items.removePhoto')} onClick={() => void run(() => unwrap(window.ci.items.removePhoto({ id })))}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-64 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{item.sku}</span>
            {item.lowStock ? <Badge tone="red">{t('items.lowStock')}</Badge> : null}
            {item.archived ? <Badge>{t('items.archived')}</Badge> : null}
          </div>
          <div>
            <h2 className="text-3xl font-light tracking-tight">{item.nameEn}</h2>
            {item.nameKm ? <div className="font-khmer text-lg text-muted-foreground">{item.nameKm}</div> : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {item.categoryNameEn ? name({ nameEn: item.categoryNameEn, nameKm: item.categoryNameKm }) : t('items.uncategorised')}
            {item.defaultLocationName ? ` · ${item.defaultLocationName}` : ''}
          </div>
          <dl className="grid grid-cols-2 gap-4 pt-2 @4xl:grid-cols-4">
            {[
              [t('items.fields.onHand'), `${number(item.onHand)} ${item.unit}`],
              [t('items.fields.minStock'), number(item.minStock)],
              [t('items.fields.unitCost'), money(item.unitCostCents)],
              [t('items.fields.value'), money(Math.max(item.onHand, 0) * item.unitCostCents)]
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="text-xl font-light tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex w-full flex-wrap gap-2 border-t pt-4">
          {canWrite && !item.archived
            ? actions.map(({ kind, icon: Icon }) => (
                <Button key={kind} variant={kind === 'in' ? 'default' : 'outline'} onClick={() => setMovement(kind)}>
                  <Icon />
                  {t(`stock.actions.${kind}`)}
                </Button>
              ))
            : null}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => setLabels(true)}>
            <QrCode />
            {t('labels.button')}
          </Button>
          {canWrite ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                {t('common.edit')}
              </Button>
              {item.archived ? (
                <Button variant="outline" onClick={() => void run(() => unwrap(window.ci.items.setArchived({ id, archived: false })), t('items.restored'))}>
                  <ArchiveRestore />
                  {t('items.restore')}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setArchiving(true)}>
                  <Archive />
                  {t('items.archive')}
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {trend ? (
        <ChartCard
          title={t('items.trendTitle')}
          subtitle={t('items.trendSubtitle', { unit: item.unit })}
          table={<DataTable head={[t('stock.fields.date'), t('items.fields.onHand')]} rows={trend.values.map((v, i) => [trend.labels[i]!, `${number(v)} ${item.unit}`])} />}
        >
          <LineChart
            ariaLabel={t('items.trendTitle')}
            labels={trend.labels}
            area
            height={160}
            formatValue={(v) => `${number(v)} ${item.unit}`}
            formatTick={(v) => number(v)}
            series={[{ key: 'level', label: t('items.fields.onHand'), color: 'var(--series-1)', values: trend.values }]}
          />
        </ChartCard>
      ) : null}

      <div className="grid gap-5 @5xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('items.byLocation')}</CardTitle>
          </CardHeader>
          <CardContent>
            {item.stockByLocation.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('items.noStock')}</p>
            ) : (
              <ul className="space-y-3">
                {item.stockByLocation.map((s) => (
                  <li key={s.locationId} className="text-sm">
                    <div className="flex justify-between">
                      <span>{s.locationName}</span>
                      <span className="font-medium tabular-nums">
                        {number(s.quantity)} <span className="font-normal text-muted-foreground">{item.unit}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[var(--series-1)]"
                        style={{ width: `${item.onHand > 0 ? Math.max((Math.max(s.quantity, 0) / item.onHand) * 100, 2) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('items.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('stock.empty')}</p>
            ) : (
              <Table className="border-0">
                <thead>
                  <tr>
                    <Th>{t('stock.fields.date')}</Th>
                    <Th>{t('stock.fields.type')}</Th>
                    <Th className="text-right">{t('stock.fields.quantity')}</Th>
                    <Th className="hidden @3xl:table-cell">{t('stock.fields.location')}</Th>
                    <Th className="hidden @6xl:table-cell">{t('stock.fields.details')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap text-muted-foreground">{dateTime(m.createdAt)}</Td>
                      <Td>
                        <MovementBadge type={m.type} />
                      </Td>
                      <Td className="text-right">
                        <SignedQuantity value={m.quantity} unit={m.unit} />
                      </Td>
                      <Td className="hidden @3xl:table-cell">{m.locationName}</Td>
                      <Td className="hidden text-muted-foreground @6xl:table-cell">
                        {[m.issuedTo, m.reason].filter(Boolean).join(' · ') || '—'}
                        <div className="text-xs">{m.createdByName}</div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {movement ? <MovementDialog open onOpenChange={(o) => !o && setMovement(null)} kind={movement} itemId={id} /> : null}
      {editing ? <ItemFormDialog open onOpenChange={setEditing} item={item} /> : null}
      <LabelDialog open={labels} onOpenChange={setLabels} itemId={id} />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={t('items.archiveTitle')}
        body={t('items.archiveBody', { name: item.nameEn })}
        confirmLabel={t('items.archive')}
        onConfirm={() => unwrap(window.ci.items.setArchived({ id, archived: true }))}
      />
    </Page>
  )
}
