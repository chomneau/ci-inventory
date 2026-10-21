import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import type { InventoryAnalytics, PeriodTotals, analyticsQuery } from '@shared/inventory'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { categories, items, stockMovements } from '../db/schema'

const DAY = 86_400_000
const TOP_N = 8

/** Local calendar day key (YYYY-MM-DD) for a timestamp. */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}

/**
 * Everything the dashboard shows for one period and (optionally) one location,
 * computed from the append-only ledger so every figure agrees with every other.
 * Values use each item's current unit cost (received stock uses the cost recorded
 * on the receipt when there is one). Transfers move stock, so they are counted as
 * movements but not as received/issued value.
 */
export function inventoryAnalytics(db: Db, query: z.output<typeof analyticsQuery>, now: Date = new Date()): InventoryAnalytics {
  const days = query.days
  const locationId = query.locationId ?? null
  const end = new Date(startOfDay(now).getTime() + DAY) // exclusive: tomorrow 00:00
  const start = new Date(startOfDay(now).getTime() - (days - 1) * DAY)
  const prevStart = new Date(start.getTime() - days * DAY)
  const atLocation = locationId ? eq(stockMovements.locationId, locationId) : undefined

  // ---- every movement from the start of the previous period (one pass, in JS)
  const rows = db
    .select({
      createdAt: stockMovements.createdAt,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      movementCost: stockMovements.unitCostCents,
      itemId: stockMovements.itemId,
      issuedTo: stockMovements.issuedTo,
      itemCost: items.unitCostCents
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .where(and(gte(stockMovements.createdAt, prevStart), lt(stockMovements.createdAt, end), atLocation))
    .all()

  const active = db
    .select({
      id: items.id,
      sku: items.sku,
      nameEn: items.nameEn,
      nameKm: items.nameKm,
      unit: items.unit,
      minStock: items.minStock,
      unitCostCents: items.unitCostCents,
      categoryId: items.categoryId,
      categoryEn: categories.nameEn,
      categoryKm: categories.nameKm
    })
    .from(items)
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .where(isNull(items.archivedAt))
    .all()
  const activeIds = new Set(active.map((i) => i.id))

  const zero = (): PeriodTotals => ({ receivedCents: 0, issuedCents: 0, movements: 0 })
  const current = zero()
  const previous = zero()
  const byDay = new Map<string, { receivedCents: number; issuedCents: number; movements: number; valueDelta: number }>()
  for (let t = start.getTime(); t < end.getTime(); t += DAY) {
    byDay.set(dayKey(new Date(t)), { receivedCents: 0, issuedCents: 0, movements: 0, valueDelta: 0 })
  }
  const issuedByItem = new Map<number, { quantity: number; valueCents: number }>()
  const issuedByRecipient = new Map<string, { recipient: string | null; valueCents: number; quantity: number; movements: number }>()

  for (const r of rows) {
    const inCurrent = r.createdAt >= start
    const totals = inCurrent ? current : previous
    // Across all locations a transfer is two rows (out + in): count the pair once.
    // Filtered to one location, each row is a separate event there.
    const counts = locationId !== null || r.type !== 'transfer_in'
    if (counts) totals.movements++
    let received = 0
    let issued = 0
    if (r.type === 'in') received = r.quantity * (r.movementCost ?? r.itemCost)
    if (r.type === 'out') issued = -r.quantity * r.itemCost
    totals.receivedCents += received
    totals.issuedCents += issued
    if (!inCurrent) continue

    const bucket = byDay.get(dayKey(r.createdAt))
    if (bucket) {
      bucket.receivedCents += received
      bucket.issuedCents += issued
      if (counts) bucket.movements++
      // Stock value changes by every movement at the filtered location (transfers net to zero overall).
      if (activeIds.has(r.itemId)) bucket.valueDelta += r.quantity * r.itemCost
    }
    if (r.type === 'out') {
      const it = issuedByItem.get(r.itemId) ?? { quantity: 0, valueCents: 0 }
      it.quantity += -r.quantity
      it.valueCents += issued
      issuedByItem.set(r.itemId, it)
      const key = (r.issuedTo ?? '').trim().toLowerCase()
      const rec = issuedByRecipient.get(key) ?? { recipient: r.issuedTo?.trim() || null, valueCents: 0, quantity: 0, movements: 0 }
      rec.valueCents += issued
      rec.quantity += -r.quantity
      rec.movements++
      issuedByRecipient.set(key, rec)
    }
  }

  // ---- current stock per item (at the location, if filtered), active items only
  const onHandRows = db
    .select({ itemId: stockMovements.itemId, onHand: sql<number>`sum(${stockMovements.quantity})` })
    .from(stockMovements)
    .where(atLocation)
    .groupBy(stockMovements.itemId)
    .all()
  const onHand = new Map(onHandRows.map((r) => [r.itemId, Number(r.onHand)]))
  // With a location filter, only items that are (or were) stocked there are in scope.
  const inScope = locationId ? active.filter((i) => onHand.has(i.id)) : active

  let stockValueCents = 0
  const health = { ok: 0, low: 0, out: 0 }
  const byCategory = new Map<number | null, { categoryId: number | null; nameEn: string; nameKm: string | null; valueCents: number; items: number }>()
  const reorder: InventoryAnalytics['reorder'] = []
  for (const i of inScope) {
    const qty = onHand.get(i.id) ?? 0
    const value = Math.max(qty, 0) * i.unitCostCents
    stockValueCents += value
    if (qty <= 0) health.out++
    else if (i.minStock > 0 && qty <= i.minStock) health.low++
    else health.ok++
    const cat = byCategory.get(i.categoryId) ?? { categoryId: i.categoryId, nameEn: i.categoryEn ?? '', nameKm: i.categoryKm, valueCents: 0, items: 0 }
    cat.valueCents += value
    cat.items++
    byCategory.set(i.categoryId, cat)
    if (i.minStock > 0 && qty <= i.minStock) {
      const suggested = Math.max(i.minStock * 2 - Math.max(qty, 0), 1)
      reorder.push({
        itemId: i.id,
        sku: i.sku,
        nameEn: i.nameEn,
        nameKm: i.nameKm,
        unit: i.unit,
        onHand: qty,
        minStock: i.minStock,
        suggestedQuantity: suggested,
        estimatedCostCents: suggested * i.unitCostCents
      })
    }
  }

  // ---- end-of-day stock value, walking back from today's value
  const keys = [...byDay.keys()]
  const series: InventoryAnalytics['series'] = new Array(keys.length)
  let value = stockValueCents
  for (let k = keys.length - 1; k >= 0; k--) {
    const b = byDay.get(keys[k]!)!
    series[k] = { day: keys[k]!, receivedCents: b.receivedCents, issuedCents: b.issuedCents, movements: b.movements, stockValueCents: Math.max(value, 0) }
    value -= b.valueDelta
  }

  const meta = new Map(active.map((i) => [i.id, i]))
  const topIssued = [...issuedByItem.entries()]
    .map(([itemId, v]) => ({ itemId, ...v, m: meta.get(itemId) }))
    .filter((x) => x.m)
    .sort((a, b) => b.valueCents - a.valueCents || b.quantity - a.quantity)
    .slice(0, TOP_N)
    .map(({ itemId, quantity, valueCents, m }) => ({ itemId, sku: m!.sku, nameEn: m!.nameEn, nameKm: m!.nameKm, unit: m!.unit, quantity, valueCents }))

  return {
    days,
    locationId,
    series,
    current,
    previous,
    stockValueCents,
    health,
    valueByCategory: [...byCategory.values()].filter((c) => c.items > 0).sort((a, b) => b.valueCents - a.valueCents),
    topIssued,
    issuedTo: [...issuedByRecipient.values()].sort((a, b) => b.valueCents - a.valueCents).slice(0, TOP_N),
    reorder: reorder.sort((a, b) => a.onHand / Math.max(a.minStock, 1) - b.onHand / Math.max(b.minStock, 1))
  }
}
