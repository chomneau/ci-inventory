import { z } from 'zod'

// ---------------------------------------------------------------- input schemas
// Shared by main (authoritative validation) and renderer (form feedback).

const id = z.number().int().positive()
const optionalId = id.nullable().optional()
const name = z.string().trim().min(1).max(120)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional()

export const MAX_QUANTITY = 1_000_000_000
const quantity = z.number().int().positive().max(MAX_QUANTITY)
const cents = z.number().int().min(0).max(100_000_000_000)

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,39}$/
export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SKU_PATTERN, 'SKU: letters, digits, . _ - (max 40)')

export const categoryInput = z.object({ nameEn: name, nameKm: optionalText(120) })
export const categoryUpdate = categoryInput.extend({ id })

export const locationInput = z.object({ name, description: optionalText(300) })
export const locationUpdate = locationInput.extend({ id })

export const itemInput = z.object({
  sku: skuSchema,
  nameEn: name,
  nameKm: optionalText(120),
  categoryId: optionalId,
  defaultLocationId: optionalId,
  unit: z.string().trim().min(1).max(20),
  minStock: z.number().int().min(0).max(MAX_QUANTITY),
  unitCostCents: cents
})
export const itemCreate = itemInput.extend({
  /** Optional opening stock, received into the default location. */
  openingQuantity: z.number().int().min(0).max(MAX_QUANTITY).optional()
})
export const itemUpdate = itemInput.extend({ id })

export const itemListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: optionalId,
  lowStockOnly: z.boolean().optional(),
  includeArchived: z.boolean().optional()
})

export const stockMovementInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('in'),
    itemId: id,
    locationId: id,
    quantity,
    unitCostCents: cents.nullable().optional(),
    reason: optionalText(300)
  }),
  z.object({
    type: z.literal('out'),
    itemId: id,
    locationId: id,
    quantity,
    issuedTo: optionalText(120),
    reason: optionalText(300)
  }),
  z.object({
    type: z.literal('adjust'),
    itemId: id,
    locationId: id,
    /** The counted quantity; the ledger records the difference. */
    countedQuantity: z.number().int().min(0).max(MAX_QUANTITY),
    reason: z.string().trim().min(1).max(300)
  }),
  z.object({
    type: z.literal('transfer'),
    itemId: id,
    fromLocationId: id,
    toLocationId: id,
    quantity,
    reason: optionalText(300)
  })
])
export type StockMovementInput = z.input<typeof stockMovementInput>

export const movementListQuery = z.object({
  itemId: optionalId,
  type: z.enum(['in', 'out', 'adjust', 'transfer_out', 'transfer_in']).optional(),
  /** Case-insensitive substring match on SKU, item names, location, recipient, reason or author. */
  search: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
})

export const analyticsQuery = z.object({
  /** Length of the period, ending today (local time). */
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  /** Limit everything to one location (stock on hand and movements). */
  locationId: id.nullable().optional()
})

// ---------------------------------------------------------------- DTOs (main → renderer)

export interface Category {
  id: number
  nameEn: string
  nameKm: string | null
  itemCount: number
  /** Current value of stock on hand for active items in this category. */
  valueCents: number
}

export interface Location {
  id: number
  name: string
  description: string | null
  archived: boolean
  itemCount: number
  /** Current value of stock held at this location. */
  valueCents: number
}

export interface ItemSummary {
  id: number
  sku: string
  nameEn: string
  nameKm: string | null
  categoryId: number | null
  categoryNameEn: string | null
  categoryNameKm: string | null
  defaultLocationId: number | null
  defaultLocationName: string | null
  unit: string
  minStock: number
  unitCostCents: number
  onHand: number
  lowStock: boolean
  archived: boolean
  hasPhoto: boolean
}

export interface ItemDetail extends ItemSummary {
  stockByLocation: { locationId: number; locationName: string; quantity: number }[]
  createdAt: number
  updatedAt: number
}

export type MovementType = 'in' | 'out' | 'adjust' | 'transfer_out' | 'transfer_in'

export interface Movement {
  id: number
  itemId: number
  sku: string
  itemNameEn: string
  itemNameKm: string | null
  unit: string
  locationId: number
  locationName: string
  type: MovementType
  quantity: number
  unitCostCents: number | null
  issuedTo: string | null
  reason: string | null
  createdByName: string
  createdAt: number
}

export interface DashboardSummary {
  totalItems: number
  lowStockCount: number
  stockValueCents: number
  movementsToday: number
  lowStock: Pick<ItemSummary, 'id' | 'sku' | 'nameEn' | 'nameKm' | 'onHand' | 'minStock' | 'unit'>[]
  recentMovements: Movement[]
}

export interface ItemLabel {
  sku: string
  nameEn: string
  nameKm: string | null
  qrDataUrl: string
}

/** Text encoded in item QR labels; scanners read this back. */
export function labelPayload(sku: string): string {
  return `CIINV:${sku}`
}

export interface DailyPoint {
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  receivedCents: number
  issuedCents: number
  movements: number
  /** Total stock value at the end of the day. */
  stockValueCents: number
}

export interface PeriodTotals {
  receivedCents: number
  issuedCents: number
  movements: number
}

export interface InventoryAnalytics {
  days: number
  locationId: number | null
  series: DailyPoint[]
  current: PeriodTotals
  /** The same-length period immediately before, for deltas. */
  previous: PeriodTotals
  stockValueCents: number
  health: { ok: number; low: number; out: number }
  valueByCategory: { categoryId: number | null; nameEn: string; nameKm: string | null; valueCents: number; items: number }[]
  topIssued: { itemId: number; sku: string; nameEn: string; nameKm: string | null; unit: string; quantity: number; valueCents: number }[]
  issuedTo: { recipient: string | null; valueCents: number; quantity: number; movements: number }[]
  reorder: {
    itemId: number
    sku: string
    nameEn: string
    nameKm: string | null
    unit: string
    onHand: number
    minStock: number
    /** Brings stock back up to twice the minimum. */
    suggestedQuantity: number
    estimatedCostCents: number
  }[]
}
