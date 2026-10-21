import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import type { PublicUser } from '@shared/auth'
import type { Channel } from '@shared/channels'
import type { IpcResult } from '@shared/ipc-result'
import { checkAccess, type Access } from './access'
import { log } from '../logger'
import { AppError } from './errors'

export interface HandlerContext {
  /** The signed-in user (null only for 'public' handlers). */
  user: PublicUser | null
  event: IpcMainInvokeEvent
}

type Handler<S extends z.ZodType, R> = (input: z.infer<S>, ctx: HandlerContext) => R | Promise<R>

let trustedSender: (url: string) => boolean = () => false
let sessionUser: () => PublicUser | null = () => null

/** Set once at startup; requests from any other frame are rejected. */
export function setTrustedSender(check: (url: string) => boolean): void {
  trustedSender = check
}

/** Set once at startup; the source of truth for who is signed in. */
export function setSessionResolver(resolve: () => PublicUser | null): void {
  sessionUser = resolve
}

const fail = (code: string, details?: Record<string, string | number>): IpcResult<never> => ({
  ok: false,
  error: details ? { code, details } : { code }
})

/**
 * Registers an IPC handler behind every check, in this order:
 * trusted top-level frame → session / role → Zod input validation → handler.
 * Always resolves to an IpcResult envelope; internal errors are never leaked.
 */
export function handle<S extends z.ZodType, R>(
  channel: Channel,
  schema: S,
  handler: Handler<S, R>,
  access: Access = 'authenticated'
): void {
  ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<R>> => {
    // Only the top-level frame of our own renderer may call in; never iframes.
    const frame = event.senderFrame
    if (!frame || frame.parent !== null || !trustedSender(frame.url)) return fail('FORBIDDEN')

    const user = sessionUser()
    const denied = checkAccess(access, user)
    if (denied) return fail(denied)

    const parsed = schema.safeParse(raw)
    if (!parsed.success) return fail('INVALID_INPUT')

    try {
      return { ok: true, data: await handler(parsed.data, { user, event }) }
    } catch (err) {
      if (err instanceof AppError) return fail(err.code, err.details)
      log.error(`[ipc] ${channel} failed:`, err)
      return fail('INTERNAL_ERROR')
    }
  })
}
