import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { passwordIssues } from '@shared/auth'
import { base32Decode, base32Encode } from '../src/main/auth/base32'
import { lockoutUntil } from '../src/main/auth/lockout'
import { generateRecoveryCodes, hashRecoveryCode } from '../src/main/auth/recovery-codes'
import { openSecret, sealSecret } from '../src/main/auth/secret-box'
import { hotp, otpauthUri, timeStep, totpAt, verifyTotp } from '../src/main/auth/totp'

describe('base32', () => {
  it('matches RFC 4648 vectors and round-trips', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar')
    const bytes = randomBytes(20)
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
  })
})

describe('TOTP', () => {
  // RFC 6238 Appendix B (SHA-1 seed "12345678901234567890"), truncated to 6 digits.
  const seed = base32Encode(Buffer.from('12345678901234567890'))
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037']
  ])('RFC 6238 vector at t=%i', (t, expected) => {
    expect(totpAt(seed, timeStep(new Date(t * 1000)))).toBe(expected)
  })

  it('matches RFC 4226 HOTP vectors', () => {
    expect(hotp(Buffer.from('12345678901234567890'), 0)).toBe('755224')
    expect(hotp(Buffer.from('12345678901234567890'), 9)).toBe('520489')
  })

  it('accepts ±1 step of drift, rejects older codes and replays', () => {
    const now = new Date(1_700_000_000_000)
    const step = timeStep(now)
    expect(verifyTotp(seed, totpAt(seed, step), now, null)).toBe(step)
    expect(verifyTotp(seed, totpAt(seed, step - 1), now, null)).toBe(step - 1)
    expect(verifyTotp(seed, totpAt(seed, step + 1), now, null)).toBe(step + 1)
    expect(verifyTotp(seed, totpAt(seed, step - 2), now, null)).toBeNull()
    expect(verifyTotp(seed, totpAt(seed, step), now, step)).toBeNull()
    expect(verifyTotp(seed, 'abcdef', now, null)).toBeNull()
  })

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'CI Inventory', 'a@ci.org')
    expect(uri).toBe('otpauth://totp/CI%20Inventory%3Aa%40ci.org?secret=JBSWY3DPEHPK3PXP&issuer=CI+Inventory&algorithm=SHA1&digits=6&period=30')
  })
})

describe('secret box', () => {
  const key = randomBytes(32)
  it('round-trips and is randomized', () => {
    const a = sealSecret(key, 'JBSWY3DPEHPK3PXP', 'user_totp:1')
    expect(a).not.toContain('JBSWY3DPEHPK3PXP')
    expect(sealSecret(key, 'JBSWY3DPEHPK3PXP', 'user_totp:1')).not.toBe(a)
    expect(openSecret(key, a, 'user_totp:1')).toBe('JBSWY3DPEHPK3PXP')
  })
  it('fails for a different row, key or a tampered value', () => {
    const sealed = sealSecret(key, 'secret', 'user_totp:1')
    expect(() => openSecret(key, sealed, 'user_totp:2')).toThrow()
    expect(() => openSecret(randomBytes(32), sealed, 'user_totp:1')).toThrow()
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => openSecret(key, parts.join('.'), 'user_totp:1')).toThrow()
  })
})

describe('recovery codes', () => {
  it('generates 10 distinct readable codes; hashing ignores case and dashes', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/)
    expect(hashRecoveryCode(codes[0]!.toLowerCase().replace('-', ' '))).toBe(hashRecoveryCode(codes[0]!))
  })
})

describe('lockout policy', () => {
  const now = new Date(0)
  it('locks after 5 failures with exponential backoff capped at 60 minutes', () => {
    expect(lockoutUntil(4, now)).toBeNull()
    expect(lockoutUntil(5, now)?.getTime()).toBe(60_000)
    expect(lockoutUntil(6, now)?.getTime()).toBe(120_000)
    expect(lockoutUntil(20, now)?.getTime()).toBe(3_600_000)
  })
})

describe('password policy', () => {
  it('flags weak passwords and accepts a passphrase', () => {
    expect(passwordIssues('short')).toContain('too_short')
    expect(passwordIssues('Password123!')).toContain('too_common')
    expect(passwordIssues('aaaaaabbbbbbb')).toContain('too_simple')
    expect(passwordIssues('sokha.chan-2026!x', 'sokha.chan@ci.org')).toContain('contains_email')
    expect(passwordIssues('river-mango-lantern-42')).toEqual([])
  })
})
