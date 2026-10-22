import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { toast } from 'sonner'
import type { StockMovementInput } from '@shared/inventory'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { parseMoney, useFormat } from '@renderer/lib/format'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useItem, useLocations } from './hooks'
import { ItemPicker } from './parts'

export type MovementKind = 'in' | 'out' | 'adjust' | 'transfer'

/** One dialog for all four stock operations; the main process enforces every rule again. */
export function MovementDialog({
  open,
  onOpenChange,
  kind,
  itemId: fixedItemId
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: MovementKind
  /** Preselected item (from an item page). Without it, the user picks one. */
  itemId?: number
}) {
  const { t } = useTranslation()
  const { number, name } = useFormat()
  const navigate = useNavigate()
  const { data: locations = [], isSuccess: locationsLoaded } = useLocations()
  // Stock always lives somewhere: without a location (two for a transfer) nothing can be recorded yet.
  const missingLocations = locationsLoaded && locations.length < (kind === 'transfer' ? 2 : 1)
  const [itemId, setItemId] = useState<number | null>(fixedItemId ?? null)
  const { data: item } = useItem(itemId ?? 0)
  const activeItem = itemId ? item : undefined
  const { run, pending, error, setError } = useAction()

  const [locationId, setLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [qty, setQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [issuedTo, setIssuedTo] = useState('')
  const [reason, setReason] = useState('')

  // Sensible default location: the item's default for receipts, else where it is stocked.
  useEffect(() => {
    if (!activeItem || locationId) return
    const stocked = activeItem.stockByLocation[0]?.locationId
    const preferred = kind === 'in' ? (activeItem.defaultLocationId ?? stocked) : (stocked ?? activeItem.defaultLocationId)
    if (preferred) setLocationId(String(preferred))
  }, [activeItem, kind, locationId])
  // With a single location there is nothing to choose.
  useEffect(() => {
    if (!locationId && locations.length === 1) setLocationId(String(locations[0]!.id))
  }, [locations, locationId])

  const available = activeItem?.stockByLocation.find((s) => s.locationId === Number(locationId))?.quantity ?? 0
  const qtyNum = Number(qty)
  const qtyOk = /^\d+$/.test(qty) && (kind === 'adjust' ? qtyNum >= 0 : qtyNum > 0)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!itemId) return
    const base = { itemId, reason: reason || null }
    let input: StockMovementInput
    switch (kind) {
      case 'in': {
        const cost = unitCost ? parseMoney(unitCost) : null
        if (cost === null && unitCost) return setError(t('items.invalidCost'))
        input = { ...base, type: 'in', locationId: Number(locationId), quantity: qtyNum, unitCostCents: cost }
        break
      }
      case 'out':
        input = { ...base, type: 'out', locationId: Number(locationId), quantity: qtyNum, issuedTo: issuedTo || null }
        break
      case 'adjust':
        input = { itemId, type: 'adjust', locationId: Number(locationId), countedQuantity: qtyNum, reason }
        break
      case 'transfer':
        input = { ...base, type: 'transfer', fromLocationId: Number(locationId), toLocationId: Number(toLocationId), quantity: qtyNum }
        break
    }
    const ok = await run(async () => {
      await unwrap(window.ci.stock.record(input))
      return true
    })
    if (ok) {
      toast.success(t(`stock.done.${kind}`))
      onOpenChange(false)
    }
  }

  const needsReason = kind === 'adjust'
  const canSubmit = itemId && locationId && qtyOk && (kind !== 'transfer' || toLocationId) && (!needsReason || reason.trim())

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`stock.actions.${kind}`)}
      description={activeItem ? `${activeItem.sku} — ${name(activeItem)}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="movement-form" disabled={pending || !canSubmit}>
            {t(`stock.actions.${kind}`)}
          </Button>
        </>
      }
    >
      <form id="movement-form" onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {missingLocations ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm" role="status">
            <MapPin className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <span className="min-w-0 flex-1">{kind === 'transfer' ? t('stock.needTwoLocations') : t('stock.needLocation')}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                navigate('/locations')
              }}
            >
              {t('stock.addLocation')}
            </Button>
          </div>
        ) : null}
        {fixedItemId ? null : (
          <Field label={t('stock.fields.item')} htmlFor="mv-item">
            <ItemPicker id="mv-item" value={itemId} onChange={setItemId} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={kind === 'transfer' ? t('stock.fields.from') : t('stock.fields.location')}
            htmlFor="mv-loc"
            hint={activeItem && kind !== 'in' ? t('stock.available', { qty: number(available), unit: activeItem.unit }) : undefined}
          >
            <Select id="mv-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'transfer' ? (
            <Field label={t('stock.fields.to')} htmlFor="mv-to">
              <Select id="mv-to" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                <option value="">—</option>
                {locations
                  .filter((l) => String(l.id) !== locationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
          <Field label={kind === 'adjust' ? t('stock.fields.counted') : t('stock.fields.quantity')} htmlFor="mv-qty">
            <Input id="mv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </Field>
          {kind === 'in' ? (
            <Field label={t('stock.fields.unitCost')} htmlFor="mv-cost">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="mv-cost" inputMode="decimal" className="pl-7" placeholder="0.00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </div>
            </Field>
          ) : null}
          {kind === 'out' ? (
            <Field label={t('stock.fields.issuedTo')} htmlFor="mv-to-person">
              <Input id="mv-to-person" maxLength={120} value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder={t('stock.issuedToHint')} />
            </Field>
          ) : null}
        </div>
        <Field label={needsReason ? t('stock.fields.reasonRequired') : t('stock.fields.reason')} htmlFor="mv-reason">
          <Textarea id="mv-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}
