/** 12+-point trend in the de-emphasis hue, with the current value marked in the accent. */
export function Sparkline({ values, width = 96, height = 28, accent = 'var(--series-1)' }: { values: number[]; width?: number; height?: number; accent?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 6)
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const last = values.length - 1
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke="var(--chart-deemph)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} fill={accent} stroke="var(--card)" strokeWidth={1.5} />
    </svg>
  )
}
