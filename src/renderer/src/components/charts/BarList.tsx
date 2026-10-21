import { useState } from 'react'

export interface BarRow {
  id: string | number
  label: string
  sublabel?: string
  value: number
  /** Extra detail for the hover/focus readout. */
  detail?: string
  onClick?: () => void
}

/**
 * Horizontal bars for ranking nominal categories: one series, one hue (no legend
 * needed), ≤ 12px bars with a 4px rounded data-end, value at the tip.
 */
export function BarList({ rows, formatValue, color = 'var(--series-1)', emptyText }: { rows: BarRow[]; formatValue: (v: number) => string; color?: string; emptyText: string }) {
  const [active, setActive] = useState<string | number | null>(null)
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0
        const Tag = r.onClick ? 'button' : 'div'
        return (
          <li key={r.id}>
            <Tag
              type={r.onClick ? 'button' : undefined}
              onClick={r.onClick}
              onPointerEnter={() => setActive(r.id)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(r.id)}
              onBlur={() => setActive(null)}
              title={r.detail}
              className="group block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {r.label}
                  {r.sublabel ? <span className="ml-1.5 text-xs text-muted-foreground">{r.sublabel}</span> : null}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatValue(r.value)}</span>
              </div>
              <div className="h-2.5 w-full">
                <div
                  className="h-full rounded-r-[4px] transition-[filter]"
                  style={{ width: `${Math.max(pct, 1.5)}%`, background: color, filter: active === r.id ? 'brightness(1.12)' : undefined }}
                />
              </div>
              {active === r.id && r.detail ? <div className="mt-1 text-xs text-muted-foreground">{r.detail}</div> : null}
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
