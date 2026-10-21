import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { niceTicks } from './scale'
import { useWidth } from './useSize'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: number[]
}

const PLOT_H = 200
const AXIS_H = 24
const PAD = { top: 8, right: 12, left: 52 }

/**
 * Multi-series line chart: 2px lines, hairline grid, one value axis, and a
 * crosshair that snaps to the nearest day with one tooltip listing every series.
 * Keyboard: focus the plot, then ←/→ to move between days.
 */
export function LineChart({
  series,
  labels,
  formatValue,
  formatTick,
  ariaLabel
}: {
  series: LineSeries[]
  /** One label per x position (e.g. "21 Oct"). */
  labels: string[]
  formatValue: (v: number) => string
  formatTick: (v: number) => string
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(max)
  const top = ticks.at(-1) ?? 1
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 72))))

  const indexAt = (clientX: number, rect: DOMRect) => {
    const rel = clientX - rect.left - PAD.left
    return Math.min(n - 1, Math.max(0, Math.round((rel / plotW) * (n - 1))))
  }
  const onMove = (e: PointerEvent<SVGRectElement>) => setHover(indexAt(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  const tipLeft = hover === null ? 0 : x(hover)
  const tipOnLeft = hover !== null && tipLeft > width * 0.6

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={PAD.top + PLOT_H + AXIS_H}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          className="block overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-chart-muted text-[11px] tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.75) || i === n - 1 ? (
              <text key={i} x={x(i)} y={PAD.top + PLOT_H + 16} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-chart-muted text-[11px]">
                {l}
              </text>
            ) : null
          )}
          {series.map((s) => (
            <path
              key={s.key}
              d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover !== null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--chart-axis)" strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
              ))}
            </g>
          ) : null}
          <rect
            x={PAD.left - 8}
            y={PAD.top}
            width={plotW + 16}
            height={PLOT_H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      ) : (
        <div style={{ height: PAD.top + PLOT_H + AXIS_H }} />
      )}
      {hover !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border bg-card px-3 py-2 text-xs shadow-lg"
          style={tipOnLeft ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
        >
          <div className="mb-1 text-muted-foreground">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5">
              <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              <span className="font-semibold tabular-nums">{formatValue(s.values[hover] ?? 0)}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
