/**
 * Every IPC call resolves to an envelope instead of throwing, so error codes
 * and details survive the process boundary intact.
 */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; details?: Record<string, string | number> } }
