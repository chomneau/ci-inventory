import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM for small secrets stored inside the (already encrypted) database,
 * e.g. TOTP seeds, so they stay protected even in a decrypted dump or export.
 * `context` is bound as associated data: a value copied to another row fails to decrypt.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
export function sealSecret(key: Buffer, plaintext: string, context: string): string {
  if (key.length !== 32) throw new Error('secret-box key must be 32 bytes')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv, tag, ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

export function openSecret(key: Buffer, sealed: string, context: string): string {
  const [version, iv, tag, ct] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unsupported sealed secret')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}
