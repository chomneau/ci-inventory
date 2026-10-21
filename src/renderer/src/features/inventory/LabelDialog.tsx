import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'
import type { ItemLabel } from '@shared/inventory'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { CiSymbol } from '@renderer/components/brand/CiLogo'
import { unwrap } from '@renderer/lib/ipc'
import { useSettings } from '@renderer/features/admin/hooks'

function Label({ label }: { label: ItemLabel }) {
  const office = useSettings().data?.officeName
  return (
    <div className="label-card flex items-center gap-3 rounded-lg border bg-white p-3 text-black">
      <img src={label.qrDataUrl} alt="" className="size-20" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm font-bold">{label.sku}</div>
        <div className="line-clamp-2 text-xs leading-snug">{label.nameEn}</div>
        {label.nameKm ? <div className="font-khmer truncate text-xs">{label.nameKm}</div> : null}
      </div>
      <div className="flex flex-col items-end gap-1 self-stretch">
        <CiSymbol className="h-8" />
        {office ? <div className="mt-auto max-w-20 text-right text-[9px] leading-tight text-neutral-500">{office}</div> : null}
      </div>
    </div>
  )
}

/** QR label preview; printing renders only the label sheet (see .print-area in styles.css). */
export function LabelDialog({ open, onOpenChange, itemId }: { open: boolean; onOpenChange: (o: boolean) => void; itemId: number }) {
  const { t } = useTranslation()
  const [copies, setCopies] = useState('1')
  const { data: label } = useQuery({ queryKey: ['label', itemId], queryFn: () => unwrap(window.ci.items.label({ id: itemId })), enabled: open })
  const count = Math.min(Math.max(Number(copies) || 1, 1), 60)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('labels.title')}
      description={t('labels.subtitle')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button disabled={!label} onClick={() => void window.ci.print()}>
            <Printer />
            {t('labels.print')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {label ? <Label label={label} /> : <div className="h-28 animate-pulse rounded-lg bg-muted" />}
        <Field label={t('labels.copies')} htmlFor="copies">
          <Input id="copies" inputMode="numeric" className="w-28" value={copies} onChange={(e) => setCopies(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
      </div>
      {label && open
        ? createPortal(
            <div className="print-area">
              {Array.from({ length: count }, (_, i) => (
                <Label key={i} label={label} />
              ))}
            </div>,
            document.body
          )
        : null}
    </Dialog>
  )
}
