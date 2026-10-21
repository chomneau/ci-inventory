import { powerMonitor } from 'electron'
import type { AuthService } from './auth-service'

const CHECK_INTERVAL_MS = 15_000

/**
 * Locks the session after `idleMinutes()` of no keyboard/mouse activity on the
 * whole computer, and immediately when the OS locks the screen or sleeps.
 * Uses the OS idle time, so the renderer cannot keep a session alive.
 */
export function startIdleLock(auth: AuthService, idleMinutes: () => number): void {
  powerMonitor.on('lock-screen', () => auth.lock('os'))
  powerMonitor.on('suspend', () => auth.lock('os'))
  setInterval(() => {
    if (auth.currentUser() && powerMonitor.getSystemIdleTime() >= idleMinutes() * 60) {
      auth.lock('idle')
    }
  }, CHECK_INTERVAL_MS).unref()
}
