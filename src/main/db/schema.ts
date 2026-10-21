import { sql } from 'drizzle-orm'
import { blob, check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Role } from '@shared/auth'

// Conventions: timestamps are integer milliseconds since epoch; money is integer
// cents (never floats); quantities are integers in the item's unit.

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
}

export const ROLES = ['admin', 'storekeeper', 'viewer'] as const satisfies readonly Role[]

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Always stored lower-cased and trimmed. */
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [check('users_role_check', sql`${t.role} in ('admin', 'storekeeper', 'viewer')`)]
)

export const userTotp = sqliteTable('user_totp', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** TOTP secret, AES-256-GCM encrypted with an app key (never plaintext). */
  secretEncrypted: text('secret_encrypted').notNull(),
  /** Null until the user confirms enrollment with a valid code. */
  enabledAt: integer('enabled_at', { mode: 'timestamp_ms' }),
  /** Last accepted 30s time step, to stop a code being replayed. */
  lastUsedStep: integer('last_used_step')
})

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' })
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)]
)

/**
 * Failed sign-in counters for email addresses that have no account, so that
 * probing for accounts locks out exactly like a real account and survives restarts.
 */
export const loginThrottle = sqliteTable('login_throttle', {
  email: text('email').primaryKey(),
  failures: integer('failures').notNull(),
  lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameEn: text('name_en').notNull(),
    nameKm: text('name_km'),
    ...timestamps
  },
  // Case-insensitive: "Stationery" and "stationery" are the same category.
  (t) => [uniqueIndex('categories_name_en_ci').on(sql`lower(${t.nameEn})`)]
)

export const locations = sqliteTable(
  'locations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [uniqueIndex('locations_name_ci').on(sql`lower(${t.name})`)]
)

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sku: text('sku').notNull().unique(),
    nameEn: text('name_en').notNull(),
    nameKm: text('name_km'),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    defaultLocationId: integer('default_location_id').references(() => locations.id, { onDelete: 'restrict' }),
    unit: text('unit').notNull().default('pcs'),
    minStock: integer('min_stock').notNull().default(0),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    /** Legacy column, unused: photos live in item_photos (inside the encrypted DB). */
    photoFile: text('photo_file'),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [
    index('items_category_idx').on(t.categoryId),
    check('items_min_stock_check', sql`${t.minStock} >= 0`),
    check('items_unit_cost_check', sql`${t.unitCostCents} >= 0`)
  ]
)

/**
 * Item photos are stored inside the encrypted database rather than as loose
 * files. Both images are re-encoded JPEGs produced by Electron's decoder.
 */
export const itemPhotos = sqliteTable('item_photos', {
  itemId: integer('item_id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  image: blob('image', { mode: 'buffer' }).notNull(),
  thumbnail: blob('thumbnail', { mode: 'buffer' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const MOVEMENT_TYPES = ['in', 'out', 'adjust', 'transfer_out', 'transfer_in'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

/**
 * Stock ledger. Stock on hand is never stored; it is SUM(quantity) per item and
 * location. Rows are append-only (enforced by triggers in migrations).
 * A transfer writes a transfer_out and a transfer_in row sharing a transferGroup.
 */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    type: text('type', { enum: MOVEMENT_TYPES }).notNull(),
    /** Signed: positive adds stock, negative removes it. */
    quantity: integer('quantity').notNull(),
    unitCostCents: integer('unit_cost_cents'),
    transferGroup: text('transfer_group'),
    issuedTo: text('issued_to'),
    reason: text('reason'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamps.createdAt
  },
  (t) => [
    index('stock_movements_item_location_idx').on(t.itemId, t.locationId),
    index('stock_movements_created_at_idx').on(t.createdAt),
    check('stock_movements_type_check', sql`${t.type} in ('in', 'out', 'adjust', 'transfer_out', 'transfer_in')`),
    check(
      'stock_movements_sign_check',
      sql`(${t.type} in ('in', 'transfer_in') and ${t.quantity} > 0)
        or (${t.type} in ('out', 'transfer_out') and ${t.quantity} < 0)
        or (${t.type} = 'adjust' and ${t.quantity} <> 0)`
    )
  ]
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-encoded value. */
  value: text('value').notNull(),
  updatedAt: timestamps.updatedAt
})

/**
 * Append-only, hash-chained audit trail. Each row's hash covers its content and
 * the previous row's hash, so editing or deleting any row breaks the chain.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    actorUserId: integer('actor_user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    /** Canonical JSON. */
    details: text('details').notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull()
  },
  (t) => [index('audit_log_entity_idx').on(t.entityType, t.entityId)]
)

