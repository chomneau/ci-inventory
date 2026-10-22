import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Package, PackagePlus, PackageSearch, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, Page, PageHeader, SortTh, StatStrip, Table, Td, Toolbar, sortRows, type SortDir } from '@renderer/components/ui/page'
import { Select } from '@renderer/components/ui/select'
import { useFormat } from '@renderer/lib/format'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { useCanWrite, useCategories, useItems } from './hooks'
import { ItemFormDialog } from './ItemFormDialog'
import { ItemThumb } from './parts'

export function ItemsPage() {
  const { t } = useTranslation()
  const { money, number, name } = useFormat()
  const navigate = useNavigate()
  const canWrite = useCanWrite()
  const [params, setParams] = useSearchParams()
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const lowStockOnly = params.get('low') === '1'
  type SortKey = 'name' | 'category' | 'location' | 'onHand' | 'min' | 'cost'
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchText.trim()), 200)
    return () => clearTimeout(h)
  }, [searchText])

  const { data: categories = [] } = useCategories()
  const { data: items, isLoading } = useItems({
    search: search || undefined,
    categoryId: categoryId ? Number(categoryId) : null,
    lowStockOnly,
    includeArchived
  })

  const { data: all = [] } = useItems({})
  const summary = {
    count: all.length,
    value: all.reduce((sum, i) => sum + Math.max(i.onHand, 0) * i.unitCostCents, 0),
    low: all.filter((i) => i.lowStock && i.onHand > 0).length,
    out: all.filter((i) => i.onHand <= 0).length
  }
  const sorted = sortRows(
    items ?? [],
    (i) =>
      ({
        name: name(i).toLowerCase(),
        category: (i.categoryNameEn ?? '~').toLowerCase(),
        location: (i.defaultLocationName ?? '~').toLowerCase(),
        onHand: i.onHand,
        min: i.minStock,
        cost: i.unitCostCents
      })[sort.key],
    sort.dir
  )

  const exportCsv = async () => {
    const r = await unwrap(window.ci.exports.csv({ kind: 'items' })).catch(() => null)
    if (r?.saved) toast.success(t('export.saved', { file: r.fileName }))
  }

  return (
    <Page>
      <PageHeader
        icon={Package}
        title={t('nav.items')}
        description={t('items.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download />
              {t('export.csv')}
            </Button>
            {canWrite ? (
              <Button onClick={() => setCreating(true)}>
                <PackagePlus />
                {t('items.new')}
              </Button>
            ) : null}
          </>
        }
      />

      <StatStrip
        items={[
          { label: t('items.summary.count'), value: number(summary.count) },
          { label: t('items.summary.value'), value: money(summary.value) },
          { label: t('items.summary.low'), value: number(summary.low), tone: summary.low ? 'warning' : undefined, onClick: () => setParams({ low: '1' }) },
          { label: t('items.summary.out'), value: number(summary.out), tone: summary.out ? 'critical' : undefined, onClick: () => setParams({ low: '1' }) }
        ]}
      />

      <Toolbar>
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('items.searchPlaceholder')} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <div className="w-52">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t('items.fields.category')}>
            <option value="">{t('items.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant={lowStockOnly ? 'selected' : 'outline'}
          onClick={() => setParams(lowStockOnly ? {} : { low: '1' })}
        >
          {t('items.lowStockOnly')}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          {t('items.showArchived')}
        </label>
      </Toolbar>

      {!isLoading && items?.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={PackageSearch}
            title={search || categoryId || lowStockOnly ? t('items.noMatches') : t('items.empty')}
            body={search || categoryId || lowStockOnly ? undefined : t('items.emptyBody')}
            action={
              canWrite && !search ? (
                <Button onClick={() => setCreating(true)}>
                  <PackagePlus />
                  {t('items.new')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh label={t('items.fields.item')} column="name" sort={sort} onSort={onSort} />
              <SortTh label={t('items.fields.category')} column="category" sort={sort} onSort={onSort} className="hidden @3xl:table-cell" />
              <SortTh label={t('items.fields.location')} column="location" sort={sort} onSort={onSort} className="hidden @5xl:table-cell" />
              <SortTh label={t('items.fields.onHand')} column="onHand" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('items.fields.minStock')} column="min" sort={sort} onSort={onSort} align="right" className="hidden @2xl:table-cell" />
              <SortTh label={t('items.fields.unitCost')} column="cost" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr
                key={item.id}
                tabIndex={0}
                onClick={() => navigate(`/items/${item.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/items/${item.id}`)}
                className={cn('cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50', item.archived && 'opacity-60')}
              >
                <Td>
                  <div className="flex items-center gap-3">
                    <ItemThumb item={item} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{name(item)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                    {item.archived ? <Badge>{t('items.archived')}</Badge> : null}
                  </div>
                </Td>
                <Td className="hidden text-muted-foreground @3xl:table-cell">{item.categoryNameEn ? name({ nameEn: item.categoryNameEn, nameKm: item.categoryNameKm }) : '—'}</Td>
                <Td className="hidden text-muted-foreground @5xl:table-cell">{item.defaultLocationName ?? '—'}</Td>
                <Td className="text-right">
                  <span className="inline-flex items-center gap-2">
                    {item.onHand <= 0 ? <Badge tone="red">{t('items.out')}</Badge> : item.lowStock ? <Badge tone="amber">{t('items.low')}</Badge> : null}
                    <span className="font-medium tabular-nums">{number(item.onHand)}</span>
                    <span className="text-muted-foreground">{item.unit}</span>
                  </span>
                </Td>
                <Td className="hidden text-right tabular-nums text-muted-foreground @2xl:table-cell">{number(item.minStock)}</Td>
                <Td className="text-right tabular-nums">{money(item.unitCostCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {creating ? <ItemFormDialog open onOpenChange={setCreating} /> : null}
    </Page>
  )
}
