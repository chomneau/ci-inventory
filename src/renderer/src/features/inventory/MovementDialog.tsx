import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MapPin, ShieldCheck, TriangleAlert } from 'lucide-react'
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
import { IpcError, unwrap, useAction } from '@renderer/lib/ipc'
import { useSettings } from '@renderer/features/admin/hooks'
import { useStaff } from '@renderer/features/staff/hooks'
import { PinInput, SetPinDialog } from '@renderer/features/staff/parts'
import { StaffPicker } from '@renderer/features/staff/StaffPicker'
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
  // Stock-out recipient: a staff member who confirms with their PIN (required unless the office turned it off).
  const requireStaff = useSettings().data?.requireStaffConfirmation ?? true
  const { data: staffList = [] } = useStaff()
  const [staffId, setStaffId] = useState<number | null>(null)
  const recipient = staffList.find((s) => s.id === staffId) ?? null
  const [pin, setPin] = useState('')
  const [settingPin, setSettingPin] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

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
        input = recipient
          ? { ...base, type: 'out', locationId: Number(locationId), quantity: qtyNum, staffId: recipient.id, pin }
          : { ...base, type: 'out', locationId: Number(locationId), quantity: qtyNum, issuedTo: issuedTo || null }
        break
      case 'adjust':
        input = { itemId, type: 'adjust', locationId: Number(locationId), countedQuantity: qtyNum, reason }
        break
      case 'transfer':
        input = { ...base, type: 'transfer', fromLocationId: Number(locationId), toLocationId: Number(toLocationId), quantity: qtyNum }
        break
    }
    const saved = await run(() =>
      unwrap(window.ci.stock.record(input)).catch((err: unknown) => {
        // Only a wrong or locked PIN is cleared; other problems (e.g. not enough stock) keep what was typed.
        if (err instanceof IpcError && (err.code === 'PIN_WRONG' || err.code === 'PIN_LOCKED')) {
          setPin('')
          setTimeout(() => pinRef.current?.focus(), 0)
        }
        throw err
      })
    )
    if (saved) {
      toast.success(recipient ? t('stock.done.outConfirmed', { name: recipient.name, ref: saved.movementId }) : t(`stock.done.${kind}`))
      onOpenChange(false)
    }
  }

  const needsReason = kind === 'adjust'
  const recipientReady = recipient ? recipient.pinSet && !recipient.pinLocked && /^\d{4,6}$/.test(pin) : !requireStaff
  const canSubmit =
    itemId && locationId && qtyOk && (kind !== 'transfer' || toLocationId) && (!needsReason || reason.trim()) && (kind !== 'out' || recipientReady)

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
        </div>
        {kind === 'out' ? (
          <Field label={t('staff.fields.recipient')} htmlFor="mv-staff">
            <StaffPicker
              id="mv-staff"
              value={staffId}
              onChange={(m) => {
                setStaffId(m?.id ?? null)
                setPin('')
              }}
            />
          </Field>
        ) : null}
        {kind === 'out' && !recipient && !requireStaff ? (
          <Field label={t('stock.fields.issuedToFree')} htmlFor="mv-to-person" hint={t('stock.issuedToFreeHint')}>
            <Input id="mv-to-person" maxLength={120} value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder={t('stock.issuedToHint')} />
          </Field>
        ) : null}
        <Field label={needsReason ? t('stock.fields.reasonRequired') : t('stock.fields.reason')} htmlFor="mv-reason">
          <Textarea id="mv-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={kind === 'out' ? 'min-h-16' : undefined} />
        </Field>
        {kind === 'out' && recipient ? (
          recipient.pinSet && !recipient.pinLocked ? (
            <section aria-labelledby="mv-confirm-title" className="rounded-xl border border-ci-blue/30 bg-ci-blue/6 p-4">
              <div className="mb-3 flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ci-blue-deep dark:text-ci-blue" />
                <div className="min-w-0">
                  <h3 id="mv-confirm-title" className="text-sm font-semibold">
                    {t('stock.confirm.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('stock.confirm.body', {
                      name: recipient.name,
                      qty: qtyOk ? number(qtyNum) : '…',
                      unit: activeItem?.unit ?? '',
                      item: activeItem ? name(activeItem) : '…'
                    })}
                  </p>
                </div>
              </div>
              <PinInput ref={pinRef} id="mv-pin" aria-label={t('stock.confirm.pinLabel', { name: recipient.name })} value={pin} onChange={setPin} />
            </section>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm" role="status">
              <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <span className="min-w-0 flex-1">
                {recipient.pinLocked ? t('stock.confirm.locked', { name: recipient.name }) : t('stock.confirm.noPin', { name: recipient.name })}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => setSettingPin(true)}>
                {recipient.pinLocked ? t('staff.pin.reset') : t('staff.pin.setNow')}
              </Button>
            </div>
          )
        ) : null}
      </form>
      {settingPin && recipient ? <SetPinDialog member={recipient} onClose={() => setSettingPin(false)} onDone={() => pinRef.current?.focus()} /> : null}
    </Dialog>
  )
}
