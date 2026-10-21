import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { IpcResult } from '@shared/ipc-result'

export class IpcError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, string | number>
  ) {
    super(code)
    this.name = 'IpcError'
  }
}

/** Turns an IpcResult envelope back into a value or a thrown IpcError. */
export async function unwrap<T>(result: Promise<IpcResult<T>>): Promise<T> {
  const r = await result
  if (r.ok) return r.data
  throw new IpcError(r.error.code, r.error.details)
}

/** Localized, user-facing text for any error from the main process. */
export function useErrorText(): (err: unknown) => string {
  const { t } = useTranslation()
  return useCallback(
    (err: unknown) => {
      if (!(err instanceof IpcError)) return t('errors.INTERNAL_ERROR')
      if (err.code === 'ACCOUNT_LOCKED') {
        const minutes = Math.max(1, Math.ceil(Number(err.details?.['retryAfterSeconds'] ?? 60) / 60))
        return t('errors.ACCOUNT_LOCKED', { count: minutes })
      }
      return t(`errors.${err.code}`, { ...err.details, defaultValue: t('errors.INTERNAL_ERROR') })
    },
    [t]
  )
}

/**
 * Runs one async action at a time and exposes pending/error state for a form.
 * `messages` overrides the text for specific error codes on this form.
 */
export function useAction(messages?: Partial<Record<string, string>>) {
  const errorText = useErrorText()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setPending(true)
      setError(null)
      try {
        return await fn()
      } catch (err) {
        // The user dismissed a step-up prompt: not an error worth showing.
        if (err instanceof IpcError && err.code === 'CANCELLED') return undefined
        setError((err instanceof IpcError && messages?.[err.code]) || errorText(err))
        return undefined
      } finally {
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [errorText]
  )

  return { run, pending, error, setError }
}
