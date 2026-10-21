import type { LucideIcon } from 'lucide-react'

export interface Segment {
  key: string
  label: string
  value: number
  color: string
  icon: LucideIcon
  onClick?: () => void
}

/**
 * Part-to-whole as one horizontal stacked bar (2px surface gaps between
 * segments), with an icon + label + count legend so status never relies on color.
 */
export function SegmentMeter({ segments, formatValue }: { segments: Segment[]; formatValue: (v: number) => string }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const visible = segments.filter((s) => s.value > 0)
  return (
    <div className="space-y-4">
      <div className={`flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px] ${total === 0 ? "bg-muted" : ""}`} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {visible.map((s) => (
          <div key={s.key} title={`${s.label}: ${formatValue(s.value)}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <ul className="space-y-1">
        {segments.map(({ key, label, value, color, icon: Icon, onClick }) => (
          <li key={key}>
            <button
              type="button"
              onClick={onClick}
              disabled={!onClick}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:hover:bg-transparent"
            >
              <Icon className="size-4 shrink-0" style={{ color }} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              <span className="font-medium tabular-nums">{formatValue(value)}</span>
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{total ? Math.round((value / total) * 100) : 0}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
