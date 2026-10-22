import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck, Download, History, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Movement, MovementType } from '@shared/inventory'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, Page, PageHeader, Table, Td, Th, Toolbar } from '@renderer/components/ui/page'
import { Select } from '@renderer/components/ui/select'
import { useFormat } from '@renderer/lib/format'
import { unwrap } from '@renderer/lib/ipc'
import { useCanWrite, useMovementPages } from './hooks'
import { MovementDialog, type MovementKind } from './MovementDialog'
import { MovementBadge, SignedQuantity } from './parts'

const TYPES: MovementType[] = ['in', 'out', 'adjust', 'transfer_out', 'transfer_in']
const PAGE = 100

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function MovementsPage() {
  const { t, i18n } = useTranslation()
  const { name } = useFormat()
  const canWrite = useCanWrite()
  const [type, setType] = useState<MovementType | ''>('')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<MovementKind | null>(null)
  // Search runs in main over the whole ledger (not just the loaded page); debounce keystrokes.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim())
    }, 250)
    return () => clearTimeout(id)
  }, [search])
  const { data, isLoading, isFetching, hasNextPage, fetchNextPage } = useMovementPages({ type: type || undefined, search: query || undefined }, PAGE)
  const movements = useMemo(() => data?.pages.flat(), [data])

  const loc = i18n.language === 'km' ? 'km-KH' : 'en-US'
  const dayLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const today = dayKey(Date.now())
    const yesterday = dayKey(Date.now() - 86_400_000)
    return (ms: number) => (dayKey(ms) === today ? t('stock.today') : dayKey(ms) === yesterday ? t('stock.yesterday') : fmt.format(new Date(ms)))
  }, [loc, t])
  const time = useMemo(() => new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }), [loc])

  const rows = movements ?? []
  const groups: { key: string; label: string; rows: Movement[] }[] = []
  for (const m of rows) {
    const k = dayKey(m.createdAt)
    // Key includes the position: a day can appear twice if ledger order and timestamps disagree (e.g. a restored backup).
    if (groups.at(-1)?.key.startsWith(k + '#') !== true) groups.push({ key: `${k}#${groups.length}`, label: dayLabel(m.createdAt), rows: [] })
    groups.at(-1)!.rows.push(m)
  }

  const exportCsv = async () => {
    const r = await unwrap(window.ci.exports.csv({ kind: 'movements' })).catch(() => null)
    if (r?.saved) toast.success(t('export.saved', { file: r.fileName }))
  }

  const buttons: { kind: MovementKind; icon: typeof ArrowDownToLine }[] = [
    { kind: 'in', icon: ArrowDownToLine },
    { kind: 'out', icon: ArrowUpFromLine },
    { kind: 'transfer', icon: ArrowLeftRight },
    { kind: 'adjust', icon: ClipboardCheck }
  ]

  return (
    <Page>
      <PageHeader
        icon={History}
        title={t('nav.stock')}
        description={t('stock.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download />
              {t('export.csv')}
            </Button>
            {canWrite
              ? buttons.map(({ kind, icon: Icon }) => (
                  <Button key={kind} variant={kind === 'in' ? 'default' : 'outline'} onClick={() => setDialog(kind)}>
                    <Icon />
                    {t(`stock.actions.${kind}`)}
                  </Button>
                ))
              : null}
          </>
        }
      />

      <Toolbar>
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('stock.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-52">
          <Select value={type} onChange={(e) => setType(e.target.value as MovementType | '')} aria-label={t('stock.fields.type')}>
            <option value="">{t('stock.allTypes')}</option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`stock.types.${ty}`)}
              </option>
            ))}
          </Select>
        </div>
      </Toolbar>

      {!isLoading && rows.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={History} title={query ? t('stock.noMatches') : t('stock.empty')} body={query ? undefined : t('stock.emptyBody')} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-24">{t('stock.fields.time')}</Th>
              <Th>{t('stock.fields.item')}</Th>
              <Th>{t('stock.fields.type')}</Th>
              <Th className="text-right">{t('stock.fields.quantity')}</Th>
              <Th className="hidden @3xl:table-cell">{t('stock.fields.location')}</Th>
              <Th className="hidden @4xl:table-cell">{t('stock.fields.details')}</Th>
              <Th className="hidden @6xl:table-cell">{t('stock.fields.by')}</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr>
                  <td colSpan={7} className="border-b bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                    {g.label}
                    <span className="ml-2 font-normal">· {t('stock.count', { count: g.rows.length })}</span>
                  </td>
                </tr>
                {g.rows.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/40">
                    <Td className="whitespace-nowrap tabular-nums text-muted-foreground">{time.format(new Date(m.createdAt))}</Td>
                    <Td>
                      <Link to={`/items/${m.itemId}`} className="font-medium hover:underline">
                        {name({ nameEn: m.itemNameEn, nameKm: m.itemNameKm })}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{m.sku}</div>
                    </Td>
                    <Td>
                      <MovementBadge type={m.type} />
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <SignedQuantity value={m.quantity} unit={m.unit} />
                    </Td>
                    <Td className="hidden @3xl:table-cell">{m.locationName}</Td>
                    <Td className="hidden max-w-72 truncate text-muted-foreground @4xl:table-cell">{[m.issuedTo, m.reason].filter(Boolean).join(' · ') || '—'}</Td>
                    <Td className="hidden text-muted-foreground @6xl:table-cell">{m.createdByName}</Td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Table>
      )}

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={isFetching} onClick={() => void fetchNextPage()}>
            {t('stock.loadMore')}
          </Button>
        </div>
      ) : null}

      {dialog ? <MovementDialog open onOpenChange={(o) => !o && setDialog(null)} kind={dialog} /> : null}
    </Page>
  )
}
