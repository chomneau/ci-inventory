import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, Notification } from 'electron'
import QRCode from 'qrcode'
import { z } from 'zod'
import type { Role } from '@shared/auth'
import { Channels, Events } from '@shared/channels'
import {
  analyticsQuery,
  categoryInput,
  categoryUpdate,
  itemCreate,
  itemListQuery,
  itemUpdate,
  labelPayload,
  locationInput,
  locationUpdate,
  movementListQuery,
  stockMovementInput,
  type ItemLabel
} from '@shared/inventory'
import { badgePayload, staffInput, staffSetPin, staffUpdate, type StaffBadge } from '@shared/staff'
import type { InventoryService, LowStockAlert } from '../services/inventory'
import { confirmRecipient, type StaffService } from '../services/staff'
import { chooseOpenPath, chooseSavePath } from '../dialogs'
import { processPhoto } from '../services/photo'
import { inventoryAnalytics } from '../services/analytics'
import type { Db } from '../db/client'
import { AppError } from './errors'
import { handle } from './router'

const WRITE: readonly Role[] = ['admin', 'storekeeper']
const id = z.object({ id: z.number().int().positive() })
const archive = id.extend({ archived: z.boolean() })
const none = z.undefined()

/** Tells every window to refetch inventory data. */
function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(Events.inventoryChanged)
}

function notifyLowStock(alert: LowStockAlert | null): void {
  if (!alert || !Notification.isSupported()) return
  new Notification({
    title: 'Low stock',
    body: `${alert.nameEn} (${alert.sku}): ${alert.onHand} ${alert.unit} left — minimum ${alert.minStock}`
  }).show()
}

export function registerInventoryHandlers(inv: InventoryService, staff: StaffService, db: Db): void {
  /** Runs a mutation, then notifies renderers. */
  const mutate =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args)
      broadcastChanged()
      return result
    }

  // ---- categories
  handle(Channels.categoriesList, none, () => inv.listCategories())
  handle(Channels.categoriesCreate, categoryInput, mutate((input, { user }) => inv.createCategory(user!, input)), WRITE)
  handle(Channels.categoriesUpdate, categoryUpdate, mutate((input, { user }) => inv.updateCategory(user!, input)), WRITE)
  handle(Channels.categoriesDelete, id, mutate((input, { user }) => inv.deleteCategory(user!, input.id)), WRITE)

  // ---- locations
  handle(Channels.locationsList, z.object({ includeArchived: z.boolean().optional() }).optional(), (input) =>
    inv.listLocations(input?.includeArchived ?? false)
  )
  handle(Channels.locationsCreate, locationInput, mutate((input, { user }) => inv.createLocation(user!, input)), WRITE)
  handle(Channels.locationsUpdate, locationUpdate, mutate((input, { user }) => inv.updateLocation(user!, input)), WRITE)
  handle(Channels.locationsSetArchived, archive, mutate((input, { user }) => inv.setLocationArchived(user!, input.id, input.archived)), WRITE)

  // ---- items
  handle(Channels.itemsList, itemListQuery.optional(), (input) => inv.listItems(input ?? {}))
  handle(Channels.itemsGet, id, (input) => inv.getItem(input.id))
  handle(Channels.itemsCreate, itemCreate, mutate((input, { user }) => inv.createItem(user!, input)), WRITE)
  handle(Channels.itemsUpdate, itemUpdate, mutate((input, { user }) => inv.updateItem(user!, input)), WRITE)
  handle(Channels.itemsSetArchived, archive, mutate((input, { user }) => inv.setItemArchived(user!, input.id, input.archived)), WRITE)

  handle(
    Channels.itemsChoosePhoto,
    id,
    async (input, { user, event }) => {
      inv.getItem(input.id) // NOT_FOUND before showing a dialog
      const file = await chooseOpenPath(event.sender, {
        title: 'Choose item photo',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
      })
      if (!file) return { updated: false }
      inv.setItemPhoto(user!, input.id, processPhoto(await readFile(file)))
      broadcastChanged()
      return { updated: true }
    },
    WRITE
  )
  handle(Channels.itemsRemovePhoto, id, mutate((input, { user }) => inv.removeItemPhoto(user!, input.id)), WRITE)
  handle(Channels.itemsPhoto, id.extend({ variant: z.enum(['image', 'thumbnail']) }), (input) => {
    const data = inv.getItemPhoto(input.id, input.variant)
    return data ? `data:image/jpeg;base64,${data.toString('base64')}` : null
  })
  handle(Channels.itemsLabel, id, async (input): Promise<ItemLabel> => {
    const item = inv.getItem(input.id)
    const qrDataUrl = await QRCode.toDataURL(labelPayload(item.sku), { errorCorrectionLevel: 'M', margin: 1, width: 320 })
    return { sku: item.sku, nameEn: item.nameEn, nameKm: item.nameKm, qrDataUrl }
  })

  // ---- staff (recipients). Anyone signed in can see the directory; the storeroom team manages it.
  handle(Channels.staffList, z.object({ includeArchived: z.boolean().optional() }).optional(), (input) => staff.list(input?.includeArchived ?? false))
  handle(Channels.staffGet, id, (input) => staff.get(input.id))
  handle(Channels.staffCreate, staffInput, mutate((input, { user }) => staff.create(user!, input)), WRITE)
  handle(Channels.staffUpdate, staffUpdate, mutate((input, { user }) => staff.update(user!, input)), WRITE)
  handle(Channels.staffSetArchived, archive, mutate((input, { user }) => staff.setArchived(user!, input.id, input.archived)), WRITE)
  handle(
    Channels.staffSetPin,
    staffSetPin,
    async (input, { user }) => {
      await staff.setPin(user!, input.id, input.pin)
      broadcastChanged()
    },
    WRITE
  )
  handle(
    Channels.staffBadge,
    id,
    async (input): Promise<StaffBadge> => {
      const member = staff.get(input.id)
      const qrDataUrl = await QRCode.toDataURL(badgePayload(member.code), { errorCorrectionLevel: 'M', margin: 1, width: 320 })
      return { code: member.code, name: member.name, department: member.department, qrDataUrl }
    },
    WRITE
  )

  // ---- stock. A stock-out is only recorded after the recipient's PIN checks out (see confirmRecipient).
  handle(
    Channels.stockRecord,
    stockMovementInput,
    async (input, { user }) => {
      const recipient = await confirmRecipient(db, staff, user!, input).catch((err: unknown) => {
        // A wrong PIN changes the staff record (failure count / lock): let screens refresh.
        if (err instanceof AppError && (err.code === 'PIN_WRONG' || err.code === 'PIN_LOCKED')) broadcastChanged()
        throw err
      })
      const { lowStock, movementId } = inv.recordMovement(user!, input, recipient)
      broadcastChanged()
      notifyLowStock(lowStock)
      return { movementId }
    },
    WRITE
  )
  handle(Channels.stockList, movementListQuery.partial().optional(), (input) => inv.listMovements(input ?? {}))
  handle(Channels.dashboardSummary, none, () => inv.dashboard())
  handle(Channels.dashboardAnalytics, analyticsQuery, (input) => inventoryAnalytics(db, input))

  // ---- export (any signed-in user may export what they can already see; every export is audited)
  handle(Channels.exportCsv, z.object({ kind: z.enum(['items', 'movements']) }), async (input, { user, event }) => {
    const stamp = new Date().toISOString().slice(0, 10)
    const filePath = await chooseSavePath(event.sender, {
      title: 'Export CSV',
      defaultPath: `ci-inventory-${input.kind}-${stamp}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!filePath) return { saved: false }
    const csv = input.kind === 'items' ? inv.itemsCsv() : inv.movementsCsv()
    // UTF-8 BOM so Excel shows Khmer correctly.
    await writeFile(filePath, '\uFEFF' + csv, 'utf8')
    const fileName = path.basename(filePath)
    inv.recordExport(user!, input.kind, fileName)
    return { saved: true, fileName }
  })

  // Printing goes through main so it can target only the requesting window.
  handle(Channels.printPage, none, (_input, { event }) => {
    event.sender.print({ silent: false, printBackground: true })
  })
}
