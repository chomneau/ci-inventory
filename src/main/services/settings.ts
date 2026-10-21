import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { settings } from '../db/schema'

/** Reads a JSON setting, falling back to `fallback` if missing or invalid. */
export function getSetting<T>(db: Db, key: string, schema: z.ZodType<T>, fallback: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row) return fallback
  try {
    const parsed = schema.safeParse(JSON.parse(row.value))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}
