import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Package, Search, ShieldCheck } from 'lucide-react'
import type { ItemSummary, Movement, MovementType } from '@shared/inventory'
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

/** Who received a stock-out (linked to the staff record, with the PIN confirmation) and any note. */
export function MovementDetails({ movement: m, showAuthor = false }: { movement: Movement; showAuthor?: boolean }) {
  const { t } = useTranslation()
  const note = m.reason ? <span className="text-muted-foreground">{m.reason}</span> : null
  return (
    <div className="min-w-0">
      {m.staffId ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={`/staff/${m.staffId}`} className="truncate font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
            {m.staffName}
          </Link>
          {m.confirmation === 'pin' ? (
            <span title={t('stock.confirm.confirmedTitle')} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-ci-green/15 px-1.5 py-px text-[11px] font-medium text-[#2f7a2a] dark:text-ci-green">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {t('stock.confirm.badge')}
            </span>
          ) : null}
        </div>
      ) : m.issuedTo ? (
        <div className="truncate">{m.issuedTo}</div>
      ) : null}
      {note ? <div className="truncate text-xs">{note}</div> : null}
      {!m.staffId && !m.issuedTo && !m.reason && !showAuthor ? <span className="text-muted-foreground">—</span> : null}
      {showAuthor ? <div className="truncate text-xs text-muted-foreground">{t('stock.recordedBy', { name: m.createdByName })}</div> : null}
    </div>
  )
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

/**
 * Searchable item chooser for stock dialogs: type part of a SKU or name (English or Khmer), then click
 * or use ↑/↓ + Enter. A real listbox rather than <datalist>, whose suggestions Electron doesn't show reliably.
 */
export function ItemPicker({ id, value, onChange }: { id: string; value: number | null; onChange: (itemId: number | null) => void }) {
  const { t } = useTranslation()
  const { name, number } = useFormat()
  const { data: items = [], isSuccess } = useItems({})
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selected = items.find((i) => i.id === value)

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
        <ItemThumb item={selected} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name(selected)}</div>
          <div className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{selected.sku}</span> · {t('stock.onHandNow', { qty: number(selected.onHand), unit: selected.unit })}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange(null)
            setQuery('')
          }}
        >
          {t('stock.changeItem')}
        </Button>
      </div>
    )
  }

  // A label scan arrives as "CIINV:SKU" (see labelPayload) followed by Enter.
  const scanned = /^CIINV:(.+)$/i.exec(query.trim())?.[1]?.trim().toUpperCase()
  const q = query.trim().toLowerCase()
  const matches = scanned
    ? items.filter((i) => i.sku === scanned)
    : (q ? items.filter((i) => [i.sku, i.nameEn, i.nameKm].some((v) => v?.toLowerCase().includes(q))) : items).slice(0, 50)
  const current = Math.min(active, Math.max(matches.length - 1, 0))
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(matches.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault() // never submit the stock form from the search box
      if (matches[current]) onChange(matches[current].id)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={matches[current] ? `${id}-opt-${matches[current].id}` : undefined}
          autoComplete="off"
          className="pl-9"
          placeholder={t('stock.pickItem')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul id={`${id}-list`} role="listbox" aria-label={t('stock.fields.item')} className="max-h-52 divide-y overflow-y-auto rounded-lg border">
        {matches.map((i, idx) => (
          <li
            key={i.id}
            id={`${id}-opt-${i.id}`}
            role="option"
            aria-selected={idx === current}
            onMouseMove={() => setActive(idx)}
            onClick={() => onChange(i.id)}
            className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', idx === current && 'bg-accent text-accent-foreground')}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{name(i)}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">{i.sku}</span>
            </span>
            <span className={cn('shrink-0 text-xs tabular-nums', i.onHand <= 0 ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground')}>
              {number(i.onHand)} {i.unit}
            </span>
          </li>
        ))}
        {isSuccess && matches.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">{items.length === 0 ? t('stock.noItemsYet') : t('stock.noItemMatches')}</li>
        ) : null}
      </ul>
    </div>
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
