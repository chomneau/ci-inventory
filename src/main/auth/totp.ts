import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { base32Decode, base32Encode } from './base32'

// RFC 6238 defaults; these are what Google/Microsoft Authenticator support everywhere.
export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
/** Accept one step either side to tolerate clock drift between PC and phone. */
const DRIFT_STEPS = 1

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20)) // 160 bits, as recommended by RFC 4226
}

export function timeStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS)
}

/** HOTP (RFC 4226) value for a given counter. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', secret).update(msg).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return binary.toString().padStart(digits, '0')
}

export function totpAt(secretBase32: string, step: number): string {
  return hotp(base32Decode(secretBase32), step)
}

/**
 * Returns the matched time step, or null. Codes for steps at or before
 * `lastUsedStep` are rejected so an observed code cannot be replayed.
 */
export function verifyTotp(secretBase32: string, code: string, now: Date, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const secret = base32Decode(secretBase32)
  const current = timeStep(now)
  let matched: number | null = null
  // Check every candidate (no early exit) to keep timing independent of which step matched.
  for (let step = current - DRIFT_STEPS; step <= current + DRIFT_STEPS; step++) {
    const ok = timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))
    if (ok && matched === null && (lastUsedStep === null || step > lastUsedStep)) matched = step
  }
  return matched
}

/**
 * Diagnostics only — never used to accept a code. When a code is refused, reports how many
 * 30-second steps away it would have matched (2..maxSteps either way), which means the
 * computer's or the phone's clock is wrong. Null when the code doesn't match nearby times.
 */
export function clockOffsetSteps(secretBase32: string, code: string, now: Date, maxSteps = 20): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const secret = base32Decode(secretBase32)
  const current = timeStep(now)
  for (let d = DRIFT_STEPS + 1; d <= maxSteps; d++) {
    for (const offset of [d, -d]) if (hotp(secret, current + offset) === code) return offset
  }
  return null
}

/** Minutes for a CLOCK_SKEW message. */
export function offsetMinutes(steps: number): number {
  return Math.max(1, Math.round((Math.abs(steps) * TOTP_PERIOD_SECONDS) / 60))
}

export function otpauthUri(secretBase32: string, issuer: string, account: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** "JBSW Y3DP EHPK 3PXP" — easier to type by hand. */
export function formatManualKey(secretBase32: string): string {
  return secretBase32.match(/.{1,4}/g)?.join(' ') ?? secretBase32
}
