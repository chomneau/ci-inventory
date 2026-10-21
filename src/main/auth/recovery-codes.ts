import { createHash, randomInt } from 'node:crypto'

// No 0/O, 1/I/L: codes are read off paper and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const RECOVERY_CODE_COUNT = 10
const CODE_LENGTH = 10

/** Ten single-use codes like "K7QPM-3XRTA" (~49 bits of entropy each). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = ''
    for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)]
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Codes are long random values, not human passwords, so a fast hash is
 * sufficient (no dictionary to attack) and keeps checking 10 codes instant.
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(`ci-inventory-recovery:${normalizeRecoveryCode(code)}`).digest('hex')
}
