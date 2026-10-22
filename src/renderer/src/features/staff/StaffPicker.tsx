import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ScanLine, Search } from 'lucide-react'
import type { StaffMember } from '@shared/staff'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useStaff } from './hooks'
import { PinStatus, StaffAvatar } from './parts'

/** "CISTAFF:KH-0142" from a badge scan, or the raw text typed. */
function scannedCode(text: string): string | null {
  const m = /^CISTAFF:(.+)$/i.exec(text.trim())
  return m ? m[1]!.trim().toUpperCase() : null
}

/**
 * Chooses who receives the items: type a name, staff ID or department, or scan the
 * person's badge (a USB scanner types the badge text followed by Enter).
 */
export function StaffPicker({ id, value, onChange }: { id: string; value: number | null; onChange: (member: StaffMember | null) => void }) {
  const { t } = useTranslation()
  const { data: staff = [], isSuccess } = useStaff()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selected = staff.find((s) => s.id === value)

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
        <StaffAvatar name={selected.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{selected.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{selected.code}</span>
            {selected.department ? ` · ${selected.department}` : ''}
          </div>
        </div>
        <PinStatus member={selected} />
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

  const scan = scannedCode(query)
  const q = query.trim().toLowerCase()
  const matches = scan
    ? staff.filter((s) => s.code === scan)
    : (q ? staff.filter((s) => [s.name, s.code, s.department].some((v) => v?.toLowerCase().includes(q))) : staff).slice(0, 50)
  const current = Math.min(active, Math.max(matches.length - 1, 0))
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(matches.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault() // never submit the stock form from the search box
      if (matches[current]) onChange(matches[current])
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
          className="pl-9 pr-9"
          placeholder={t('staff.pickPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <ScanLine className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
      <ul id={`${id}-list`} role="listbox" aria-label={t('staff.fields.recipient')} className="max-h-48 divide-y overflow-y-auto rounded-lg border">
        {matches.map((s, idx) => (
          <li
            key={s.id}
            id={`${id}-opt-${s.id}`}
            role="option"
            aria-selected={idx === current}
            onMouseMove={() => setActive(idx)}
            onClick={() => onChange(s)}
            className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', idx === current && 'bg-accent text-accent-foreground')}
          >
            <StaffAvatar name={s.name} className="size-7 text-[10px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                <span className="font-mono">{s.code}</span>
                {s.department ? ` · ${s.department}` : ''}
              </span>
            </span>
            {s.pinSet && !s.pinLocked ? null : <PinStatus member={s} />}
          </li>
        ))}
        {isSuccess && matches.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">{staff.length === 0 ? t('staff.noneYet') : t('staff.noMatches')}</li>
        ) : null}
      </ul>
    </div>
  )
}
