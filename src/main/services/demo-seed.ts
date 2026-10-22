import { count } from 'drizzle-orm'
import type { Db } from '../db/client'
import { categories, items, locations, staff, stockMovements, users } from '../db/schema'

/**
 * DEVELOPMENT ONLY (never runs in a packaged build): fills an empty inventory with
 * ~90 days of realistic, deterministic history so dashboards can be designed and
 * screenshot-tested. Called only when CI_INV_DEMO_SEED=1 and an admin exists.
 */
export function seedDemoData(db: Db, now = new Date()): boolean {
  if ((db.select({ n: count() }).from(items).get()?.n ?? 0) > 0) return false
  const admin = db.select({ id: users.id }).from(users).limit(1).get()
  if (!admin) return false

  let seed = 42
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const DAY = 86_400_000

  const cat = (nameEn: string, nameKm: string) => db.insert(categories).values({ nameEn, nameKm }).returning().get().id
  const loc = (name: string) => db.insert(locations).values({ name }).returning().get().id
  const stationery = cat('Stationery', 'សម្ភារៈការិយាល័យ')
  const cleaning = cat('Cleaning', 'សម្ភារៈសម្អាត')
  const it = cat('IT accessories', 'គ្រឿងបន្លាស់ IT')
  const kitchen = cat('Kitchen', 'ផ្ទះបាយ')
  const printing = cat('Printing', 'ការបោះពុម្ព')
  const main = loc('Main storeroom')
  const office = loc('Office 2F')
  const field = loc('Field office Siem Reap')
  // Staff directory without PINs: each person chooses their own PIN at the desk.
  db.insert(staff)
    .values([
      { code: 'S-0001', name: 'Dara Sok', department: 'Finance' },
      { code: 'S-0002', name: 'Sophea Chan', department: 'Programs' },
      { code: 'S-0003', name: 'Vanna Kim', department: 'HR' },
      { code: 'S-0004', name: 'Rithy Meas', department: 'Field team' },
      { code: 'S-0005', name: 'Chenda Ly', department: 'Communications' }
    ])
    .run()

  const catalog: [string, string, string, number, string, number, number, number][] = [
    // sku, nameEn, nameKm, category, unit, min, costCents, opening
    ['PAPER-A4', 'A4 paper (500 sheets)', 'ក្រដាស A4', printing, 'ream', 20, 450, 160],
    ['TONER-HP', 'HP toner cartridge', 'ទឹកថ្នាំម៉ាស៊ីនបោះពុម្ព HP', printing, 'pcs', 4, 6500, 14],
    ['PEN-BLUE', 'Blue ballpoint pen', 'ប៊ិចខៀវ', stationery, 'pcs', 50, 25, 600],
    ['NOTEBOOK', 'Notebook A5', 'សៀវភៅកត់ត្រា A5', stationery, 'pcs', 20, 120, 150],
    ['STAPLES', 'Staples box', 'ប្រអប់ខ្ទាស់', stationery, 'box', 5, 80, 30],
    ['FOLDER', 'Document folder', 'ថតឯកសារ', stationery, 'pcs', 30, 60, 200],
    ['MARKER', 'Whiteboard marker', 'ប៊ិចហ្វឺតក្ដារស', stationery, 'pcs', 12, 90, 48],
    ['SOAP', 'Hand soap 500ml', 'សាប៊ូលាងដៃ', cleaning, 'bottle', 10, 210, 40],
    ['TISSUE', 'Tissue box', 'ប្រអប់ក្រដាសជូត', cleaning, 'box', 24, 95, 120],
    ['BIN-BAG', 'Garbage bags (roll)', 'ថង់សំរាម', cleaning, 'roll', 10, 150, 36],
    ['MOUSE', 'USB mouse', 'កណ្ដុរ USB', it, 'pcs', 3, 850, 12],
    ['CABLE-HDMI', 'HDMI cable 2m', 'ខ្សែ HDMI', it, 'pcs', 2, 600, 8],
    ['COFFEE', 'Coffee 1kg', 'កាហ្វេ', kitchen, 'kg', 4, 1200, 20],
    ['WATER', 'Drinking water 20L', 'ទឹកសុទ្ធ 20L', kitchen, 'bottle', 6, 150, 40]
  ]
  const recipients = ['Finance', 'Programs', 'HR', 'Administration', 'Field team', 'Communications']
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const start = midnight.getTime() - 89 * DAY
  // Movements are collected first and inserted in time order, so ledger ids are chronological like real data.
  const pending: (typeof stockMovements.$inferInsert)[] = []

  db.transaction((tx) => {
    for (const [sku, nameEn, nameKm, categoryId, unit, minStock, unitCostCents, opening] of catalog) {
      const itemId = tx.insert(items).values({ sku, nameEn, nameKm, categoryId, unit, minStock, unitCostCents, defaultLocationId: main }).returning().get().id
      // Office hours 08:00–16:45, spread per item and day without consuming rand() (keeps the demo numbers stable);
      // never in the future when seeding early in the morning.
      const mv = (d: number, values: Omit<typeof stockMovements.$inferInsert, 'itemId' | 'createdBy' | 'createdAt'>) => {
        const minutes = 8 * 60 + ((itemId * 97 + d * 41) % 36) * 15
        const at = Math.min(start + d * DAY + minutes * 60_000, now.getTime() - 60_000)
        pending.push({ ...values, itemId, createdBy: admin.id, createdAt: new Date(at) })
      }
      let stock = opening
      mv(0, { type: 'in', locationId: main, quantity: opening, unitCostCents, reason: 'Opening stock' })
      const dailyUse = opening / 70
      for (let d = 1; d < 90; d++) {
        const weekday = new Date(start + d * DAY).getDay()
        if (weekday === 0 || weekday === 6) continue
        if (rand() < 0.45) {
          const q = Math.max(1, Math.round(dailyUse * (0.5 + rand() * 2)))
          if (q <= stock) {
            mv(d, { type: 'out', locationId: main, quantity: -q, issuedTo: recipients[Math.floor(rand() * recipients.length)]! })
            stock -= q
          }
        }
        // Restock some items when low (others are deliberately left low/out for the demo).
        if (stock <= minStock && rand() < 0.5 && !['TONER-HP', 'MOUSE', 'COFFEE', 'SOAP'].includes(sku)) {
          const q = Math.round(minStock * 3 + rand() * minStock)
          mv(d, { type: 'in', locationId: main, quantity: q, unitCostCents: Math.round(unitCostCents * (0.95 + rand() * 0.1)) })
          stock += q
        }
        if (d % 21 === 0 && stock > minStock * 2) {
          const q = Math.round(stock * 0.15)
          if (q > 0) {
            mv(d, { type: 'transfer_out', locationId: main, quantity: -q })
            mv(d, { type: 'transfer_in', locationId: rand() < 0.5 ? office : field, quantity: q })
            stock -= q
          }
        }
      }
    }
    pending.sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime()) // stable: transfer pairs stay together
    for (const m of pending) tx.insert(stockMovements).values(m).run()
  })
  return true
}
