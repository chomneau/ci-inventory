import { useId } from 'react'
import {
  Archive,
  Boxes,
  Calculator,
  ClipboardList,
  Package,
  PackageCheck,
  Paperclip,
  PenLine,
  Printer,
  Ruler,
  ScanBarcode,
  Scissors,
  Stamp,
  Tag,
  Truck,
  Warehouse,
  type LucideIcon
} from 'lucide-react'

/** One tile of scattered inventory and office-supply icons (x, y, rotation in a 280×280 tile). */
const TILE = 280
const ICONS: [LucideIcon, number, number, number][] = [
  [Package, 18, 22, -8],
  [ClipboardList, 98, 8, 6],
  [Printer, 184, 30, -4],
  [Paperclip, 248, 92, 24],
  [Boxes, 40, 102, 4],
  [ScanBarcode, 128, 88, -10],
  [PenLine, 206, 130, 12],
  [Archive, 14, 186, -6],
  [Calculator, 92, 164, 8],
  [PackageCheck, 160, 200, -12],
  [Ruler, 236, 214, 30],
  [Tag, 60, 244, 14],
  [Truck, 120, 252, -2],
  [Scissors, 200, 262, -18],
  [Stamp, 248, 10, 10],
  [Warehouse, 150, 140, 0]
]

/**
 * Seamless background texture of inventory/office-supply line icons.
 * Colour comes from `currentColor`; keep opacity low so content stays readable.
 */
export function InventoryPattern({ className, scale = 1, iconSize = 22 }: { className?: string; scale?: number; iconSize?: number }) {
  const id = 'inv' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const half = iconSize / 2
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={id} width={TILE * scale} height={TILE * scale} patternUnits="userSpaceOnUse">
          <g transform={`scale(${scale})`}>
            {ICONS.map(([Icon, x, y, r], i) => (
              <g key={i} transform={`rotate(${r} ${x + half} ${y + half})`}>
                <Icon x={x} y={y} size={iconSize} strokeWidth={1.4} />
              </g>
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
