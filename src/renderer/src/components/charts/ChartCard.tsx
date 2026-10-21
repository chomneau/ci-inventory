import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Table2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface LegendItem {
  label: string
  color: string
  shape: 'line' | 'rect'
}

/**
 * Card that owns a chart's title, legend and the table-view twin (the
 * accessible equivalent of every chart). Grows with its content: no fixed height.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  action,
  dimmed,
  className,
  children
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  /** Table view of the same data; omit for figures that are already text. */
  table?: ReactNode
  action?: ReactNode
  /** Refetching: keep the previous render, dimmed (no skeleton flash). */
  dimmed?: boolean
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border bg-card p-5 shadow-xs', className)} aria-label={title}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {legend && legend.length >= 2 ? (
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={l.shape === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[3px]'}
                    style={{ background: l.color }}
                  />
                  {l.label}
                </li>
              ))}
            </ul>
          ) : null}
          {action}
          {table ? (
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={asTable ? t('charts.showChart') : t('charts.showTable')}
              title={asTable ? t('charts.showChart') : t('charts.showTable')}
              aria-pressed={asTable}
            >
              {asTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            </button>
          ) : null}
        </div>
      </header>
      <div className={cn('min-w-0 flex-1 transition-opacity', dimmed && 'opacity-60')}>
        {asTable && table ? <div className="max-h-80 overflow-auto">{table}</div> : children}
      </div>
    </section>
  )
}

/** Compact, accessible table used as a chart's table view. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={cn('border-b px-2 py-1.5 text-xs font-medium text-muted-foreground', i === 0 ? 'text-left' : 'text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td key={ci} className={cn('border-b px-2 py-1.5', ci === 0 ? 'text-left' : 'text-right tabular-nums')}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
