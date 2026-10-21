import { randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

// Argon2id, 64 MiB, 3 passes, 4 lanes (above OWASP minimums; ~30 ms per check).
// algorithm 2 = Argon2id (the package exports it as a const enum, which isolatedModules can't inline).
const OPTIONS = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 4 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | null = null

/**
 * Burns the same time as a real check, so "no such user" cannot be told apart
 * from "wrong password" by measuring response time.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(await dummyHash, password)
  return false
}
