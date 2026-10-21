import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Package } from 'lucide-react'
import type { ItemSummary, MovementType } from '@shared/inventory'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Alert } from '@renderer/components/ui/alert'
import { cn } from '@renderer/lib/utils'
import { useFormat } from '@renderer/lib/format'
import { useAction } from '@renderer/lib/ipc'
import { useItems, usePhoto } from './hooks'

export function ItemThumb({ item, className }: { item: Pick<ItemSummary, 'id' | 'hasPhoto'>; className?: string }) {
  const { data } = usePhoto(item.id, 'thumbnail', item.hasPhoto)
  return data ? (
    <img src={data} alt="" className={cn('size-10 shrink-0 rounded-lg border object-cover', className)} />
  ) : (
    <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground', className)}>
      <Package className="size-4" />
    </div>
  )
}

const TYPE_TONE: Record<MovementType, 'green' | 'red' | 'amber' | 'blue'> = {
  in: 'green',
  out: 'red',
  adjust: 'amber',
  transfer_in: 'blue',
  transfer_out: 'blue'
}

export function MovementBadge({ type }: { type: MovementType }) {
  const { t } = useTranslation()
  return <Badge tone={TYPE_TONE[type]}>{t(`stock.types.${type}`)}</Badge>
}

export function SignedQuantity({ value, unit }: { value: number; unit: string }) {
  const { number } = useFormat()
  return (
    <span className={cn('font-medium tabular-nums', value > 0 ? 'text-[#2f7a2a] dark:text-ci-green' : 'text-red-600 dark:text-red-400')}>
      {value > 0 ? '+' : '−'}
      {number(Math.abs(value))} <span className="font-normal text-muted-foreground">{unit}</span>
    </span>
  )
}

/** Type-ahead item picker ("SKU — name"), backed by a native datalist. */
export function ItemPicker({ id, value, onChange }: { id: string; value: number | null; onChange: (itemId: number | null) => void }) {
  const { t } = useTranslation()
  const { name } = useFormat()
  const { data: items = [] } = useItems({})
  const label = (i: ItemSummary) => `${i.sku} — ${name(i)}`
  const selected = items.find((i) => i.id === value)
  const [text, setText] = useState(selected ? label(selected) : '')
  return (
    <>
      <Input
        id={id}
        list={`${id}-options`}
        placeholder={t('stock.pickItem')}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const sku = e.target.value.split(' — ')[0]?.trim().toUpperCase()
          onChange(items.find((i) => i.sku === sku)?.id ?? null)
        }}
      />
      <datalist id={`${id}-options`}>
        {items.map((i) => (
          <option key={i.id} value={label(i)} />
        ))}
      </datalist>
    </>
  )
}

/** In-app confirmation (no native confirm()), for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const { run, pending, error } = useAction()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-600/90"
            disabled={pending}
            onClick={async () => {
              const ok = await run(async () => {
                await onConfirm()
                return true
              })
              if (ok) onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {error ? <Alert>{error}</Alert> : null}
        <div>{body}</div>
      </div>
    </Dialog>
  )
}
