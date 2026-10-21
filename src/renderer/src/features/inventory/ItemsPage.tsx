import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, PackagePlus, PackageSearch, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, PageHeader, Table, Td, Th } from '@renderer/components/ui/page'
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

  const exportCsv = async () => {
    const r = await unwrap(window.ci.exports.csv({ kind: 'items' })).catch(() => null)
    if (r?.saved) toast.success(t('export.saved', { file: r.fileName }))
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <PageHeader
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
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
      </div>

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
              <Th>{t('items.fields.item')}</Th>
              <Th>{t('items.fields.category')}</Th>
              <Th>{t('items.fields.location')}</Th>
              <Th className="text-right">{t('items.fields.onHand')}</Th>
              <Th className="text-right">{t('items.fields.minStock')}</Th>
              <Th className="text-right">{t('items.fields.unitCost')}</Th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
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
                <Td className="text-muted-foreground">{item.categoryNameEn ? name({ nameEn: item.categoryNameEn, nameKm: item.categoryNameKm }) : '—'}</Td>
                <Td className="text-muted-foreground">{item.defaultLocationName ?? '—'}</Td>
                <Td className="text-right">
                  <span className="inline-flex items-center gap-2">
                    {item.lowStock ? <Badge tone="red">{t('items.low')}</Badge> : null}
                    <span className="font-medium tabular-nums">{number(item.onHand)}</span>
                    <span className="text-muted-foreground">{item.unit}</span>
                  </span>
                </Td>
                <Td className="text-right tabular-nums text-muted-foreground">{number(item.minStock)}</Td>
                <Td className="text-right tabular-nums">{money(item.unitCostCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {creating ? <ItemFormDialog open onOpenChange={setCreating} /> : null}
    </div>
  )
}
