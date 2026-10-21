import { dialog } from 'electron'
import { DatabaseKeyError } from './db/key'
import { log } from './logger'

const MESSAGES: Record<string, string> = {
  ENCRYPTION_UNAVAILABLE:
    'This computer has no secure credential store available, so CI Inventory cannot protect its data and will not start.\n\n' +
    'On Linux, install and unlock a keyring (GNOME Keyring or KWallet), then try again.',
  KEY_UNREADABLE:
    'CI Inventory could not unlock its data key from the system keychain.\n\n' +
    'If you denied keychain access, restart the app and choose "Allow". ' +
    'Data copied from another computer or user account cannot be opened; restore it from an encrypted backup instead.',
  KEY_MISSING:
    'The data key for the existing database is missing, so the data cannot be opened.\n\n' +
    'Restore from an encrypted backup, or contact your administrator.'
}

/** Shows a blocking, user-readable error for anything that prevents startup. */
export function showStartupError(err: unknown): void {
  const message =
    err instanceof DatabaseKeyError
      ? MESSAGES[err.code]
      : 'The database could not be opened. It may be damaged or from a different installation.\n\nContact your administrator.'
  log.error('[startup]', err)
  dialog.showErrorBox('CI Inventory cannot start', message ?? String(err))
}
