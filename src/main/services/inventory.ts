import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gte, isNull, sql, type SQL } from 'drizzle-orm'
import type { PublicUser } from '@shared/auth'
import type {
  Category,
  DashboardSummary,
  ItemDetail,
  ItemSummary,
  Location,
  Movement,
  categoryInput,
  categoryUpdate,
  itemCreate,
  itemListQuery,
  itemUpdate,
  locationInput,
  locationUpdate,
  movementListQuery,
  stockMovementInput
} from '@shared/inventory'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { categories, itemPhotos, items, locations, stockMovements, users } from '../db/schema'
import { AppError } from '../ipc/errors'
import { recordAudit, type DbOrTx } from './audit'
import { toCsv } from './csv'

type In<T extends z.ZodType> = z.output<T>

export interface LowStockAlert {
  itemId: number
  sku: string
  nameEn: string
  onHand: number
  minStock: number
  unit: string
}

/** SQLite constraint errors from better-sqlite3 carry these codes. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/**
 * Categories, locations, items and the stock ledger. Every mutation runs in a
 * transaction together with its audit entry. Stock is never stored: it is the
 * sum of the append-only movements.
 */
export class InventoryService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ================================================================ categories

  listCategories(): Category[] {
    return this.db
      .select({
        id: categories.id,
        nameEn: categories.nameEn,
        nameKm: categories.nameKm,
        itemCount: sql<number>`(select count(*) from items i where i.category_id = "categories"."id" and i.archived_at is null)`,
        valueCents: sql<number>`(select coalesce(sum(max(s.q, 0) * i.unit_cost_cents), 0) from items i
          join (select item_id, sum(quantity) q from stock_movements group by item_id) s on s.item_id = i.id
          where i.category_id = "categories"."id" and i.archived_at is null)`
      })
      .from(categories)
      .orderBy(asc(categories.nameEn))
      .all()
  }

  createCategory(actor: PublicUser, input: In<typeof categoryInput>): Category {
    return this.write(() =>
      this.db.transaction((tx) => {
        const row = tx.insert(categories).values({ nameEn: input.nameEn, nameKm: input.nameKm ?? null }).returning().get()
        recordAudit(tx, { actorUserId: actor.id, action: 'category.create', entityType: 'category', entityId: row.id, details: { ...input } })
        return { id: row.id, nameEn: row.nameEn, nameKm: row.nameKm, itemCount: 0, valueCents: 0 }
      })
    )
  }

  updateCategory(actor: PublicUser, input: In<typeof categoryUpdate>): void {
    this.write(() =>
      this.db.transaction((tx) => {
        const before = tx.select().from(categories).where(eq(categories.id, input.id)).get()
        if (!before) throw new AppError('NOT_FOUND')
        tx.update(categories)
          .set({ nameEn: input.nameEn, nameKm: input.nameKm ?? null, updatedAt: this.now() })
          .where(eq(categories.id, input.id))
          .run()
        recordAudit(tx, {
          actorUserId: actor.id,
          action: 'category.update',
          entityType: 'category',
          entityId: input.id,
          details: { before: { nameEn: before.nameEn, nameKm: before.nameKm }, after: { nameEn: input.nameEn, nameKm: input.nameKm ?? null } }
        })
      })
    )
  }

  deleteCategory(actor: PublicUser, id: number): void {
    this.db.transaction((tx) => {
      const row = tx.select().from(categories).where(eq(categories.id, id)).get()
      if (!row) throw new AppError('NOT_FOUND')
      const used = tx.select({ n: count() }).from(items).where(eq(items.categoryId, id)).get()?.n ?? 0
      if (used > 0) throw new AppError('CATEGORY_IN_USE', { items: used })
      tx.delete(categories).where(eq(categories.id, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: 'category.delete', entityType: 'category', entityId: id, details: { nameEn: row.nameEn } })
    })
  }

  // ================================================================ locations

  listLocations(includeArchived = false): Location[] {
    const rows = this.db
      .select({
        id: locations.id,
        name: locations.name,
        description: locations.description,
        archivedAt: locations.archivedAt,
        // Correlated subqueries name the outer table explicitly: inside a nested select,
        // drizzle's unqualified column would resolve to the inner table instead.
        itemCount: sql<number>`(select count(*) from (select item_id from stock_movements where location_id = "locations"."id" group by item_id having sum(quantity) <> 0))`,
        valueCents: sql<number>`(select coalesce(sum(max(s.q, 0) * i.unit_cost_cents), 0) from items i
          join (select item_id, sum(quantity) q from stock_movements where location_id = "locations"."id" group by item_id) s on s.item_id = i.id
          where i.archived_at is null)`
      })
      .from(locations)
      .where(includeArchived ? undefined : isNull(locations.archivedAt))
      .orderBy(asc(locations.name))
      .all()
    return rows.map(({ archivedAt, ...r }) => ({ ...r, archived: archivedAt !== null }))
  }

  createLocation(actor: PublicUser, input: In<typeof locationInput>): Location {
    return this.write(() =>
      this.db.transaction((tx) => {
        const row = tx.insert(locations).values({ name: input.name, description: input.description ?? null }).returning().get()
        recordAudit(tx, { actorUserId: actor.id, action: 'location.create', entityType: 'location', entityId: row.id, details: { ...input } })
        return { id: row.id, name: row.name, description: row.description, archived: false, itemCount: 0, valueCents: 0 }
      })
    )
  }

  updateLocation(actor: PublicUser, input: In<typeof locationUpdate>): void {
    this.write(() =>
      this.db.transaction((tx) => {
        const before = tx.select().from(locations).where(eq(locations.id, input.id)).get()
        if (!before) throw new AppError('NOT_FOUND')
        tx.update(locations)
          .set({ name: input.name, description: input.description ?? null, updatedAt: this.now() })
          .where(eq(locations.id, input.id))
          .run()
        recordAudit(tx, {
          actorUserId: actor.id,
          action: 'location.update',
          entityType: 'location',
          entityId: input.id,
          details: { before: { name: before.name, description: before.description }, after: { ...input } }
        })
      })
    )
  }

  /** A location can only be archived once it holds no stock. */
  setLocationArchived(actor: PublicUser, id: number, archived: boolean): void {
    this.db.transaction((tx) => {
      const row = tx.select().from(locations).where(eq(locations.id, id)).get()
      if (!row) throw new AppError('NOT_FOUND')
      if (archived) {
        const holding = tx.get<{ n: number }>(
          sql`select count(*) as n from (select item_id from stock_movements where location_id = ${id} group by item_id having sum(quantity) <> 0)`
        )
        if ((holding?.n ?? 0) > 0) throw new AppError('LOCATION_HAS_STOCK', { items: holding?.n ?? 0 })
      }
      tx.update(locations).set({ archivedAt: archived ? this.now() : null, updatedAt: this.now() }).where(eq(locations.id, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: archived ? 'location.archive' : 'location.restore', entityType: 'location', entityId: id })
    })
  }

  // ================================================================ items

  listItems(query: In<typeof itemListQuery> = {}): ItemSummary[] {
    const conditions: SQL[] = []
    if (!query.includeArchived) conditions.push(isNull(items.archivedAt))
    if (query.categoryId) conditions.push(eq(items.categoryId, query.categoryId))
    if (query.search) {
      const p = likePattern(query.search)
      conditions.push(
        sql`(${items.sku} like ${p} escape '\\' or ${items.nameEn} like ${p} escape '\\' or ${items.nameKm} like ${p} escape '\\')`
      )
    }
    const rows = this.itemSelect(this.db)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(items.nameEn))
      .all()
    const list = rows.map(toSummary)
    return query.lowStockOnly ? list.filter((i) => i.lowStock) : list
  }

  getItem(id: number): ItemDetail {
    const row = this.itemSelect(this.db).where(eq(items.id, id)).get()
    if (!row) throw new AppError('NOT_FOUND')
    const stockByLocation = this.db
      .select({
        locationId: stockMovements.locationId,
        locationName: locations.name,
        quantity: sql<number>`sum(${stockMovements.quantity})`
      })
      .from(stockMovements)
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .where(eq(stockMovements.itemId, id))
      .groupBy(stockMovements.locationId)
      .having(sql`sum(${stockMovements.quantity}) <> 0`)
      .orderBy(asc(locations.name))
      .all()
    return { ...toSummary(row), stockByLocation, createdAt: row.item.createdAt.getTime(), updatedAt: row.item.updatedAt.getTime() }
  }

  createItem(actor: PublicUser, input: In<typeof itemCreate>): ItemDetail {
    const { openingQuantity, ...fields } = input
    const id = this.write(() =>
      this.db.transaction((tx) => {
        this.assertReferences(tx, fields.categoryId, fields.defaultLocationId)
        if (openingQuantity && !fields.defaultLocationId) throw new AppError('LOCATION_REQUIRED')
        const row = tx
          .insert(items)
          .values({ ...fields, categoryId: fields.categoryId ?? null, defaultLocationId: fields.defaultLocationId ?? null, nameKm: fields.nameKm ?? null })
          .returning()
          .get()
        recordAudit(tx, { actorUserId: actor.id, action: 'item.create', entityType: 'item', entityId: row.id, details: { ...fields } })
        if (openingQuantity && fields.defaultLocationId) {
          tx.insert(stockMovements)
            .values({
              itemId: row.id,
              locationId: fields.defaultLocationId,
              type: 'in',
              quantity: openingQuantity,
              unitCostCents: fields.unitCostCents,
              reason: 'Opening stock',
              createdBy: actor.id
            })
            .run()
          recordAudit(tx, {
            actorUserId: actor.id,
            action: 'stock.in',
            entityType: 'item',
            entityId: row.id,
            details: { sku: row.sku, locationId: fields.defaultLocationId, quantity: openingQuantity, reason: 'Opening stock' }
          })
        }
        return row.id
      })
    )
    return this.getItem(id)
  }

  updateItem(actor: PublicUser, input: In<typeof itemUpdate>): ItemDetail {
    const { id, ...fields } = input
    this.write(() =>
      this.db.transaction((tx) => {
        const before = tx.select().from(items).where(eq(items.id, id)).get()
        if (!before) throw new AppError('NOT_FOUND')
        this.assertReferences(tx, fields.categoryId, fields.defaultLocationId)
        const next = { ...fields, categoryId: fields.categoryId ?? null, defaultLocationId: fields.defaultLocationId ?? null, nameKm: fields.nameKm ?? null }
        tx.update(items).set({ ...next, updatedAt: this.now() }).where(eq(items.id, id)).run()
        const changed = Object.fromEntries(
          (Object.keys(next) as (keyof typeof next)[])
            .filter((k) => before[k] !== next[k])
            .map((k) => [k, { from: before[k], to: next[k] }])
        )
        recordAudit(tx, { actorUserId: actor.id, action: 'item.update', entityType: 'item', entityId: id, details: { sku: before.sku, changed } })
      })
    )
    return this.getItem(id)
  }

  setItemArchived(actor: PublicUser, id: number, archived: boolean): void {
    this.db.transaction((tx) => {
      const row = tx.select().from(items).where(eq(items.id, id)).get()
      if (!row) throw new AppError('NOT_FOUND')
      tx.update(items).set({ archivedAt: archived ? this.now() : null, updatedAt: this.now() }).where(eq(items.id, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: archived ? 'item.archive' : 'item.restore', entityType: 'item', entityId: id, details: { sku: row.sku } })
    })
  }

  setItemPhoto(actor: PublicUser, id: number, photo: { image: Buffer; thumbnail: Buffer }): void {
    this.db.transaction((tx) => {
      const row = tx.select({ sku: items.sku }).from(items).where(eq(items.id, id)).get()
      if (!row) throw new AppError('NOT_FOUND')
      const values = { ...photo, updatedAt: this.now() }
      tx.insert(itemPhotos).values({ itemId: id, ...values }).onConflictDoUpdate({ target: itemPhotos.itemId, set: values }).run()
      recordAudit(tx, { actorUserId: actor.id, action: 'item.photo_set', entityType: 'item', entityId: id, details: { sku: row.sku } })
    })
  }

  removeItemPhoto(actor: PublicUser, id: number): void {
    this.db.transaction((tx) => {
      tx.delete(itemPhotos).where(eq(itemPhotos.itemId, id)).run()
      recordAudit(tx, { actorUserId: actor.id, action: 'item.photo_remove', entityType: 'item', entityId: id })
    })
  }

  getItemPhoto(id: number, variant: 'image' | 'thumbnail'): Buffer | null {
    const row = this.db.select({ data: itemPhotos[variant] }).from(itemPhotos).where(eq(itemPhotos.itemId, id)).get()
    return row?.data ?? null
  }

  // ================================================================ stock ledger

  recordMovement(actor: PublicUser, input: In<typeof stockMovementInput>): { lowStock: LowStockAlert | null } {
    return this.db.transaction((tx) => {
      const item = tx.select().from(items).where(eq(items.id, input.itemId)).get()
      if (!item) throw new AppError('NOT_FOUND')
      if (item.archivedAt) throw new AppError('ITEM_ARCHIVED')
      const before = this.onHand(tx, item.id)
      const base = { itemId: item.id, createdBy: actor.id, reason: input.reason ?? null }
      let details: Record<string, unknown>

      switch (input.type) {
        case 'in': {
          this.assertActiveLocation(tx, input.locationId)
          tx.insert(stockMovements)
            .values({ ...base, type: 'in', locationId: input.locationId, quantity: input.quantity, unitCostCents: input.unitCostCents ?? null })
            .run()
          details = { locationId: input.locationId, quantity: input.quantity, unitCostCents: input.unitCostCents ?? null }
          break
        }
        case 'out': {
          this.assertActiveLocation(tx, input.locationId)
          this.assertAvailable(tx, item.id, input.locationId, input.quantity)
          tx.insert(stockMovements)
            .values({ ...base, type: 'out', locationId: input.locationId, quantity: -input.quantity, issuedTo: input.issuedTo ?? null })
            .run()
          details = { locationId: input.locationId, quantity: input.quantity, issuedTo: input.issuedTo ?? null }
          break
        }
        case 'adjust': {
          this.assertActiveLocation(tx, input.locationId)
          const current = this.onHandAt(tx, item.id, input.locationId)
          const delta = input.countedQuantity - current
          if (delta === 0) throw new AppError('NO_CHANGE')
          tx.insert(stockMovements).values({ ...base, type: 'adjust', locationId: input.locationId, quantity: delta }).run()
          details = { locationId: input.locationId, from: current, to: input.countedQuantity, delta }
          break
        }
        case 'transfer': {
          if (input.fromLocationId === input.toLocationId) throw new AppError('SAME_LOCATION')
          this.assertActiveLocation(tx, input.fromLocationId)
          this.assertActiveLocation(tx, input.toLocationId)
          this.assertAvailable(tx, item.id, input.fromLocationId, input.quantity)
          const transferGroup = randomUUID()
          tx.insert(stockMovements)
            .values([
              { ...base, type: 'transfer_out', locationId: input.fromLocationId, quantity: -input.quantity, transferGroup },
              { ...base, type: 'transfer_in', locationId: input.toLocationId, quantity: input.quantity, transferGroup }
            ])
            .run()
          details = { from: input.fromLocationId, to: input.toLocationId, quantity: input.quantity }
          break
        }
      }

      const after = this.onHand(tx, item.id)
      recordAudit(tx, {
        actorUserId: actor.id,
        action: `stock.${input.type}`,
        entityType: 'item',
        entityId: item.id,
        details: { sku: item.sku, ...details, reason: input.reason ?? null, onHandBefore: before, onHandAfter: after }
      })

      // Alert only when this movement takes the item across its threshold.
      const crossed = item.minStock > 0 && before > item.minStock && after <= item.minStock
      return {
        lowStock: crossed ? { itemId: item.id, sku: item.sku, nameEn: item.nameEn, onHand: after, minStock: item.minStock, unit: item.unit } : null
      }
    })
  }

  listMovements(query: Partial<In<typeof movementListQuery>> = {}): Movement[] {
    const conditions: SQL[] = []
    if (query.itemId) conditions.push(eq(stockMovements.itemId, query.itemId))
    if (query.type) conditions.push(eq(stockMovements.type, query.type))
    const q = query.search?.trim().toLowerCase()
    if (q) {
      // instr() rather than LIKE, so % and _ in the search are literal characters.
      const cols = [items.sku, items.nameEn, items.nameKm, locations.name, stockMovements.issuedTo, stockMovements.reason, users.displayName]
      conditions.push(sql`(${sql.join(cols.map((c) => sql`instr(lower(coalesce(${c}, '')), ${q}) > 0`), sql` or `)})`)
    }
    const rows = this.db
      .select({
        id: stockMovements.id,
        itemId: stockMovements.itemId,
        sku: items.sku,
        itemNameEn: items.nameEn,
        itemNameKm: items.nameKm,
        unit: items.unit,
        locationId: stockMovements.locationId,
        locationName: locations.name,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        unitCostCents: stockMovements.unitCostCents,
        issuedTo: stockMovements.issuedTo,
        reason: stockMovements.reason,
        createdByName: users.displayName,
        createdAt: stockMovements.createdAt
      })
      .from(stockMovements)
      .innerJoin(items, eq(items.id, stockMovements.itemId))
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .innerJoin(users, eq(users.id, stockMovements.createdBy))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(stockMovements.id))
      .limit(query.limit ?? 100)
      .offset(query.offset ?? 0)
      .all()
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }))
  }

  dashboard(): DashboardSummary {
    const active = this.listItems()
    const low = active.filter((i) => i.lowStock).sort((a, b) => a.onHand / Math.max(a.minStock, 1) - b.onHand / Math.max(b.minStock, 1))
    const startOfDay = new Date(this.now())
    startOfDay.setHours(0, 0, 0, 0)
    const today = this.db.select({ n: count() }).from(stockMovements).where(gte(stockMovements.createdAt, startOfDay)).get()?.n ?? 0
    return {
      totalItems: active.length,
      lowStockCount: low.length,
      stockValueCents: active.reduce((sum, i) => sum + Math.max(i.onHand, 0) * i.unitCostCents, 0),
      movementsToday: today,
      lowStock: low.slice(0, 8).map(({ id, sku, nameEn, nameKm, onHand, minStock, unit }) => ({ id, sku, nameEn, nameKm, onHand, minStock, unit })),
      recentMovements: this.listMovements({ limit: 8 })
    }
  }

  // ================================================================ exports

  itemsCsv(): string {
    const header = ['SKU', 'Name (EN)', 'Name (KM)', 'Category', 'Unit', 'On hand', 'Min stock', 'Low stock', 'Unit cost (USD)', 'Stock value (USD)', 'Default location', 'Archived']
    const rows = this.listItems({ includeArchived: true }).map((i) => [
      i.sku,
      i.nameEn,
      i.nameKm,
      i.categoryNameEn,
      i.unit,
      i.onHand,
      i.minStock,
      i.lowStock,
      i.unitCostCents / 100,
      (Math.max(i.onHand, 0) * i.unitCostCents) / 100,
      i.defaultLocationName,
      i.archived
    ])
    return toCsv([header, ...rows])
  }

  movementsCsv(): string {
    const header = ['Date', 'SKU', 'Item', 'Type', 'Quantity', 'Unit', 'Location', 'Issued to', 'Reason', 'Unit cost (USD)', 'Recorded by']
    const rows = this.listMovements({ limit: Number.MAX_SAFE_INTEGER }).map((m) => [
      new Date(m.createdAt).toISOString(),
      m.sku,
      m.itemNameEn,
      m.type,
      m.quantity,
      m.unit,
      m.locationName,
      m.issuedTo,
      m.reason,
      m.unitCostCents === null ? null : m.unitCostCents / 100,
      m.createdByName
    ])
    return toCsv([header, ...rows])
  }

  recordExport(actor: PublicUser, kind: 'items' | 'movements', fileName: string): void {
    recordAudit(this.db, { actorUserId: actor.id, action: 'export.csv', details: { kind, fileName } })
  }

  // ================================================================ internals

  private itemSelect(db: DbOrTx) {
    const stock = db
      .select({ itemId: stockMovements.itemId, onHand: sql<number>`sum(${stockMovements.quantity})`.as('on_hand') })
      .from(stockMovements)
      .groupBy(stockMovements.itemId)
      .as('stock')
    return db
      .select({
        item: items,
        categoryNameEn: categories.nameEn,
        categoryNameKm: categories.nameKm,
        defaultLocationName: locations.name,
        onHand: sql<number>`coalesce(${stock.onHand}, 0)`,
        hasPhoto: sql<number>`exists(select 1 from item_photos p where p.item_id = "items"."id")`
      })
      .from(items)
      .leftJoin(categories, eq(categories.id, items.categoryId))
      .leftJoin(locations, eq(locations.id, items.defaultLocationId))
      .leftJoin(stock, eq(stock.itemId, items.id))
      .$dynamic()
  }

  private onHand(tx: DbOrTx, itemId: number): number {
    return tx.get<{ n: number | null }>(sql`select sum(quantity) as n from stock_movements where item_id = ${itemId}`)?.n ?? 0
  }

  private onHandAt(tx: DbOrTx, itemId: number, locationId: number): number {
    return (
      tx.get<{ n: number | null }>(sql`select sum(quantity) as n from stock_movements where item_id = ${itemId} and location_id = ${locationId}`)?.n ?? 0
    )
  }

  private assertAvailable(tx: DbOrTx, itemId: number, locationId: number, quantity: number): void {
    const available = this.onHandAt(tx, itemId, locationId)
    if (quantity > available) throw new AppError('INSUFFICIENT_STOCK', { available })
  }

  private assertActiveLocation(tx: DbOrTx, locationId: number): void {
    const loc = tx.select({ archivedAt: locations.archivedAt }).from(locations).where(eq(locations.id, locationId)).get()
    if (!loc) throw new AppError('NOT_FOUND')
    if (loc.archivedAt) throw new AppError('LOCATION_ARCHIVED')
  }

  private assertReferences(tx: DbOrTx, categoryId?: number | null, locationId?: number | null): void {
    if (categoryId && !tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get()) {
      throw new AppError('NOT_FOUND')
    }
    if (locationId) this.assertActiveLocation(tx, locationId)
  }

  /** Maps unique-constraint failures (duplicate SKU / name) to a user-facing error. */
  private write<T>(fn: () => T): T {
    try {
      return fn()
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('DUPLICATE')
      throw err
    }
  }
}

type ItemRow = {
  item: typeof items.$inferSelect
  categoryNameEn: string | null
  categoryNameKm: string | null
  defaultLocationName: string | null
  onHand: number
  hasPhoto: number
}

function toSummary(r: ItemRow): ItemSummary {
  const i = r.item
  return {
    id: i.id,
    sku: i.sku,
    nameEn: i.nameEn,
    nameKm: i.nameKm,
    categoryId: i.categoryId,
    categoryNameEn: r.categoryNameEn,
    categoryNameKm: r.categoryNameKm,
    defaultLocationId: i.defaultLocationId,
    defaultLocationName: r.defaultLocationName,
    unit: i.unit,
    minStock: i.minStock,
    unitCostCents: i.unitCostCents,
    onHand: Number(r.onHand),
    lowStock: i.minStock > 0 && Number(r.onHand) <= i.minStock,
    archived: i.archivedAt !== null,
    hasPhoto: Boolean(r.hasPhoto)
  }
}
