import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { SKU_PATTERN, type ItemDetail } from '@shared/inventory'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { centsToInput, parseMoney, useFormat } from '@renderer/lib/format'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useCategories, useLocations } from './hooks'

const UNITS = ['pcs', 'box', 'pack', 'ream', 'set', 'bottle', 'roll', 'kg', 'litre']

export function ItemFormDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: ItemDetail }) {
  const { t } = useTranslation()
  const { name } = useFormat()
  const navigate = useNavigate()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { run, pending, error, setError } = useAction({ DUPLICATE: t('items.duplicateSku') })

  const [sku, setSku] = useState(item?.sku ?? '')
  const [nameEn, setNameEn] = useState(item?.nameEn ?? '')
  const [nameKm, setNameKm] = useState(item?.nameKm ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId?.toString() ?? '')
  const [locationId, setLocationId] = useState(item?.defaultLocationId?.toString() ?? '')
  const [unit, setUnit] = useState(item?.unit ?? 'pcs')
  const [minStock, setMinStock] = useState(String(item?.minStock ?? 0))
  const [unitCost, setUnitCost] = useState(item ? centsToInput(item.unitCostCents) : '')
  const [opening, setOpening] = useState('')

  const skuOk = SKU_PATTERN.test(sku.trim().toUpperCase())
  const minOk = /^\d+$/.test(minStock)
  const openingOk = opening === '' || /^\d+$/.test(opening)
  const cost = parseMoney(unitCost)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (cost === null) return setError(t('items.invalidCost'))
    const fields = {
      sku: sku.trim().toUpperCase(),
      nameEn,
      nameKm: nameKm || null,
      categoryId: categoryId ? Number(categoryId) : null,
      defaultLocationId: locationId ? Number(locationId) : null,
      unit: unit.trim(),
      minStock: Number(minStock),
      unitCostCents: cost
    }
    const saved = await run(() =>
      unwrap(item ? window.ci.items.update({ ...fields, id: item.id }) : window.ci.items.create({ ...fields, openingQuantity: opening ? Number(opening) : undefined }))
    )
    if (!saved) return
    toast.success(item ? t('items.saved') : t('items.created', { sku: saved.sku }))
    onOpenChange(false)
    if (!item) navigate(`/items/${saved.id}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? t('items.edit') : t('items.new')}
      className="w-[min(92vw,40rem)]"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="item-form" disabled={pending || !skuOk || !nameEn.trim() || !unit.trim() || !minOk || !openingOk}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <Field label={t('items.fields.sku')} htmlFor="sku" hint={sku && !skuOk ? t('items.skuHint') : undefined}>
          <Input id="sku" autoFocus required className="font-mono uppercase" maxLength={40} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="PEN-BLUE" />
        </Field>
        <Field label={t('items.fields.unit')} htmlFor="unit">
          <Input id="unit" required list="units" maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} />
          <datalist id="units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label={t('items.fields.nameEn')} htmlFor="nameEn">
          <Input id="nameEn" required maxLength={120} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={t('items.fields.nameKm')} htmlFor="nameKm">
          <Input id="nameKm" maxLength={120} className="font-khmer" value={nameKm} onChange={(e) => setNameKm(e.target.value)} />
        </Field>
        <Field label={t('items.fields.category')} htmlFor="category">
          <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('items.fields.location')} htmlFor="location">
          <Select id="location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('items.fields.minStock')} htmlFor="min" hint={t('items.minStockHint')}>
          <Input id="min" inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label={t('items.fields.unitCost')} htmlFor="cost">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input id="cost" inputMode="decimal" className="pl-7" placeholder="0.00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
        </Field>
        {!item ? (
          <Field label={t('items.fields.opening')} htmlFor="opening" hint={t('items.openingHint')}>
            <Input id="opening" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </Field>
        ) : null}
      </form>
    </Dialog>
  )
}
