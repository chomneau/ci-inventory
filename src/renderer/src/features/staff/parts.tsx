import { forwardRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, Lock, Printer, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { pinIssue, type StaffBadge, type StaffMember } from '@shared/staff'
import { Alert } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { CiSymbol } from '@renderer/components/brand/CiLogo'
import { useSettings } from '@renderer/features/admin/hooks'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import { staffInitials } from './hooks'

export function StaffAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-ci-blue/12 text-xs font-semibold text-ci-blue-deep dark:text-ci-blue', className)} aria-hidden="true">
      {staffInitials(name)}
    </span>
  )
}

export function PinStatus({ member }: { member: Pick<StaffMember, 'pinSet' | 'pinLocked'> }) {
  const { t } = useTranslation()
  if (member.pinLocked)
    return (
      <Badge tone="red">
        <Lock className="size-3" />
        {t('staff.pin.locked')}
      </Badge>
    )
  return member.pinSet ? (
    <Badge tone="green">
      <ShieldCheck className="size-3" />
      {t('staff.pin.set')}
    </Badge>
  ) : (
    <Badge tone="amber">{t('staff.pin.notSet')}</Badge>
  )
}

/** Masked 4–6 digit PIN field. Digits only; never autofilled or remembered by the browser. */
export const PinInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }>(
  function PinInput({ value, onChange, className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        placeholder="••••"
        className={cn('h-12 text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]', className)}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        {...props}
      />
    )
  }
)

/** The staff member chooses their own PIN, typing it twice on this screen. */
export function SetPinDialog({ member, onClose, onDone }: { member: StaffMember; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const { run, pending, error } = useAction({ PIN_TOO_SIMPLE: t('staff.pin.tooSimple') })
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const issue = pin.length >= 4 ? pinIssue(pin) : null
  const mismatch = confirm.length >= pin.length && confirm !== '' && confirm !== pin
  const ok = pin.length >= 4 && issue === null && confirm === pin

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const done = await run(async () => {
      await unwrap(window.ci.staff.setPin({ id: member.id, pin }))
      return true
    })
    if (done) {
      toast.success(t('staff.pin.saved', { name: member.name }))
      onDone?.()
      onClose()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={member.pinSet ? t('staff.pin.resetTitle', { name: member.name }) : t('staff.pin.setTitle', { name: member.name })}
      description={t('staff.pin.handOver', { name: member.name })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="pin-form" disabled={pending || !ok}>
            <KeyRound />
            {t('staff.pin.save')}
          </Button>
        </>
      }
    >
      <form id="pin-form" onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t('staff.pin.new')} htmlFor="pin-new" hint={issue === 'too_simple' ? t('staff.pin.tooSimple') : t('staff.pin.rules')}>
          <PinInput id="pin-new" autoFocus value={pin} onChange={setPin} />
        </Field>
        <Field label={t('staff.pin.confirm')} htmlFor="pin-confirm" hint={mismatch ? t('staff.pin.mismatch') : undefined}>
          <PinInput id="pin-confirm" value={confirm} onChange={setConfirm} />
        </Field>
      </form>
    </Dialog>
  )
}

export function StaffFormDialog({ member, onClose, onSaved }: { member: StaffMember | null; onClose: () => void; onSaved?: (m: StaffMember) => void }) {
  const { t } = useTranslation()
  const { run, pending, error } = useAction({ DUPLICATE: t('staff.duplicate') })
  const [name, setName] = useState(member?.name ?? '')
  const [code, setCode] = useState(member?.code ?? '')
  const [department, setDepartment] = useState(member?.department ?? '')
  const codeOk = code.trim() === '' ? !member : /^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(code.trim().toUpperCase())

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const saved = await run(() =>
      unwrap(
        member
          ? window.ci.staff.update({ id: member.id, code: code.trim(), name, department: department || null })
          : window.ci.staff.create({ code: code.trim() || undefined, name, department: department || null })
      )
    )
    if (saved) {
      toast.success(member ? t('common.saved') : t('staff.created', { name: saved.name, code: saved.code }))
      onSaved?.(saved)
      onClose()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={member ? t('staff.edit') : t('staff.new')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="staff-form" disabled={pending || !name.trim() || !codeOk}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Field label={t('staff.fields.name')} htmlFor="staff-name">
            <Input id="staff-name" autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label={t('staff.fields.code')} htmlFor="staff-code" hint={code && !codeOk ? t('staff.codeHint') : member ? undefined : t('staff.codeAuto')}>
          <Input id="staff-code" className="font-mono uppercase" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder={member ? undefined : 'S-0001'} />
        </Field>
        <Field label={t('staff.fields.department')} htmlFor="staff-dept">
          <Input id="staff-dept" maxLength={80} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t('staff.departmentPlaceholder')} />
        </Field>
      </form>
    </Dialog>
  )
}

function BadgeCard({ badge }: { badge: StaffBadge }) {
  const office = useSettings().data?.officeName
  return (
    <div className="badge-card flex aspect-[85.6/54] w-full max-w-[340px] flex-col overflow-hidden rounded-xl border bg-white text-black">
      <div className="flex items-center gap-2 bg-[#0279B4] px-3 py-1.5 text-white">
        <span className="rounded bg-white p-0.5">
          <CiSymbol className="h-5" />
        </span>
        <span className="truncate text-[11px] font-medium">{office}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">Staff</div>
          <div className="line-clamp-2 text-base font-semibold leading-tight">{badge.name}</div>
          {badge.department ? <div className="truncate text-xs text-neutral-600">{badge.department}</div> : null}
          <div className="mt-1 font-mono text-sm font-bold">{badge.code}</div>
        </div>
        <img src={badge.qrDataUrl} alt="" className="size-24 shrink-0" />
      </div>
      <div className="h-1 bg-[#4AAA42]" />
    </div>
  )
}

/** Staff badge preview; printing renders only the badge sheet (see .print-area in styles.css). */
export function BadgeDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: badge } = useQuery({ queryKey: ['badge', member.id, member.code], queryFn: () => unwrap(window.ci.staff.badge({ id: member.id })) })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('staff.badge.title')}
      description={t('staff.badge.subtitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button disabled={!badge} onClick={() => void window.ci.print()}>
            <Printer />
            {t('labels.print')}
          </Button>
        </>
      }
    >
      <div className="grid place-items-center">{badge ? <BadgeCard badge={badge} /> : <div className="aspect-[85.6/54] w-full max-w-[340px] animate-pulse rounded-xl bg-muted" />}</div>
      {badge
        ? createPortal(
            <div className="print-area badges">
              <BadgeCard badge={badge} />
            </div>,
            document.body
          )
        : null}
    </Dialog>
  )
}
