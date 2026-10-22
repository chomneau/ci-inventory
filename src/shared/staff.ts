import { z } from 'zod'

// Staff are the people who receive supplies. They have no app account; they confirm
// each receipt with a personal PIN typed on the storekeeper's screen.

const id = z.number().int().positive()

export const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,19}$/
export const staffCodeSchema = z.string().trim().toUpperCase().regex(STAFF_CODE_PATTERN)

export const staffInput = z.object({
  /** Staff ID from HR, e.g. "KH-0142". Leave empty to have one generated (S-0001…). */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => (s === '' ? undefined : s))
    .pipe(staffCodeSchema.optional())
    .optional(),
  name: z.string().trim().min(1).max(100),
  department: z
    .string()
    .trim()
    .max(80)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional()
})
export const staffUpdate = staffInput.extend({ id, code: staffCodeSchema })

export const PIN_PATTERN = /^\d{4,6}$/
export const pinSchema = z.string().regex(PIN_PATTERN)

/** Rejects PINs anyone could guess: one repeated digit, or a straight run (1234, 9876…). */
export function pinIssue(pin: string): 'format' | 'too_simple' | null {
  if (!PIN_PATTERN.test(pin)) return 'format'
  const d = [...pin].map(Number)
  if (d.every((x) => x === d[0])) return 'too_simple'
  const steps = d.slice(1).map((x, i) => x - d[i]!)
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'too_simple'
  return null
}

export const staffSetPin = z.object({ id, pin: pinSchema })

/** Text encoded in staff badge QR codes; scanners type this back into the staff picker. */
export function badgePayload(code: string): string {
  return `CISTAFF:${code}`
}

export interface StaffMember {
  id: number
  code: string
  name: string
  department: string | null
  pinSet: boolean
  /** Too many wrong PINs; a new PIN (or waiting) unlocks. */
  pinLocked: boolean
  pinSetAt: number | null
  pinSetByName: string | null
  archived: boolean
  /** Stock-out movements this person has received. */
  receipts: number
  lastReceiptAt: number | null
  createdAt: number
}

export interface StaffBadge {
  code: string
  name: string
  department: string | null
  qrDataUrl: string
}
