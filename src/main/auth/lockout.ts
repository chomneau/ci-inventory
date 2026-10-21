export const MAX_FAILED_ATTEMPTS = 5
const BASE_LOCK_MINUTES = 1
const MAX_LOCK_MINUTES = 60

/**
 * After 5 failures the account locks for 1 min, then 2, 4, 8... up to 60 min
 * for each further failure. Returns null while under the threshold.
 */
export function lockoutUntil(failedCount: number, now: Date): Date | null {
  if (failedCount < MAX_FAILED_ATTEMPTS) return null
  const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** (failedCount - MAX_FAILED_ATTEMPTS), MAX_LOCK_MINUTES)
  return new Date(now.getTime() + minutes * 60_000)
}
