/**
 * Original eight-petal Khmer flower (phka chan) in fine line art: a centre
 * medallion, rounded inner petals, pointed double-outlined outer petals and
 * small leaf tips. Drawn with currentColor so it takes any brand colour.
 */
const OUTER = 'M0 -40 C 18 -50, 20 -72, 0 -94 C -20 -72, -18 -50, 0 -40 Z'
const OUTER_INNER = 'M0 -50 C 10 -58, 11 -72, 0 -84 C -11 -72, -10 -58, 0 -50 Z'
const INNER = 'M0 -22 C 13 -26, 17 -42, 0 -50 C -17 -42, -13 -26, 0 -22 Z'
const TIP = 'M0 -58 C 5 -63, 5 -70, 0 -76 C -5 -70, -5 -63, 0 -58 Z'

export function KhmerFlower({ className, strokeWidth = 1.4 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} fill="none" stroke="currentColor" aria-hidden="true">
      <FlowerShape strokeWidth={strokeWidth} />
    </svg>
  )
}

/** The flower as a <g>, for use inside other SVGs (e.g. the tiling pattern). */
export function FlowerShape({ strokeWidth = 1.4 }: { strokeWidth?: number }) {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <g strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      {angles.map((a) => (
        <g key={`o${a}`} transform={`rotate(${a + 22.5})`}>
          <path d={OUTER} />
          <path d={OUTER_INNER} strokeWidth={strokeWidth * 0.6} />
        </g>
      ))}
      {angles.map((a) => (
        <g key={`i${a}`} transform={`rotate(${a})`}>
          <path d={INNER} />
          <path d={TIP} strokeWidth={strokeWidth * 0.7} />
        </g>
      ))}
      <circle r="22" />
      <circle r="14" strokeWidth={strokeWidth * 0.7} />
      <circle r="4" strokeWidth={strokeWidth * 0.7} />
    </g>
  )
}
