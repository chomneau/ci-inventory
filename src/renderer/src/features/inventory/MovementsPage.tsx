import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck, Download, History } from 'lucide-react'
import { toast } from 'sonner'
import type { MovementType } from '@shared/inventory'
import { Button } from '@renderer/components/ui/button'
import { EmptyState, PageHeader, Table, Td, Th } from '@renderer/components/ui/page'
import { Select } from '@renderer/components/ui/select'
import { useFormat } from '@renderer/lib/format'
import { unwrap } from '@renderer/lib/ipc'
import { useCanWrite, useMovements } from './hooks'
import { MovementDialog, type MovementKind } from './MovementDialog'
import { MovementBadge, SignedQuantity } from './parts'

const TYPES: MovementType[] = ['in', 'out', 'adjust', 'transfer_out', 'transfer_in']

export function MovementsPage() {
  const { t } = useTranslation()
  const { dateTime, name } = useFormat()
  const canWrite = useCanWrite()
  const [type, setType] = useState<MovementType | ''>('')
  const [dialog, setDialog] = useState<MovementKind | null>(null)
  const { data: movements, isLoading } = useMovements({ type: type || undefined, limit: 300 })

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
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <PageHeader
        title={t('nav.stock')}
        description={t('stock.subtitle')}
        actions={
          <Button variant="outline" onClick={() => void exportCsv()}>
            <Download />
            {t('export.csv')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {canWrite
          ? buttons.map(({ kind, icon: Icon }) => (
              <Button key={kind} variant={kind === 'in' ? 'default' : 'outline'} onClick={() => setDialog(kind)}>
                <Icon />
                {t(`stock.actions.${kind}`)}
              </Button>
            ))
          : null}
        <div className="ml-auto w-52">
          <Select value={type} onChange={(e) => setType(e.target.value as MovementType | '')} aria-label={t('stock.fields.type')}>
            <option value="">{t('stock.allTypes')}</option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`stock.types.${ty}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!isLoading && movements?.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={History} title={t('stock.empty')} body={t('stock.emptyBody')} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('stock.fields.date')}</Th>
              <Th>{t('stock.fields.item')}</Th>
              <Th>{t('stock.fields.type')}</Th>
              <Th className="text-right">{t('stock.fields.quantity')}</Th>
              <Th>{t('stock.fields.location')}</Th>
              <Th>{t('stock.fields.details')}</Th>
              <Th>{t('stock.fields.by')}</Th>
            </tr>
          </thead>
          <tbody>
            {(movements ?? []).map((m) => (
              <tr key={m.id} className="hover:bg-muted/40">
                <Td className="whitespace-nowrap text-muted-foreground">{dateTime(m.createdAt)}</Td>
                <Td>
                  <Link to={`/items/${m.itemId}`} className="font-medium hover:underline">
                    {name({ nameEn: m.itemNameEn, nameKm: m.itemNameKm })}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{m.sku}</div>
                </Td>
                <Td>
                  <MovementBadge type={m.type} />
                </Td>
                <Td className="text-right">
                  <SignedQuantity value={m.quantity} unit={m.unit} />
                </Td>
                <Td>{m.locationName}</Td>
                <Td className="max-w-64 truncate text-muted-foreground">{[m.issuedTo, m.reason].filter(Boolean).join(' · ') || '—'}</Td>
                <Td className="text-muted-foreground">{m.createdByName}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {dialog ? <MovementDialog open onOpenChange={(o) => !o && setDialog(null)} kind={dialog} /> : null}
    </div>
  )
}
