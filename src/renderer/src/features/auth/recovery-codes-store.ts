/**
 * Hands the one-time recovery codes from the enrollment screen to the codes
 * screen. Memory only: Web Storage is persisted to disk by Chromium.
 */
let pending: string[] = []

export function holdRecoveryCodes(codes: string[]): void {
  pending = codes
}

export function peekRecoveryCodes(): string[] {
  return pending
}

export function clearRecoveryCodes(): void {
  pending = []
}
