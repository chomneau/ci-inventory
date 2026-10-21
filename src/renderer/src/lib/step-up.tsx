import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { CodeInput } from '@renderer/components/ui/code-input'
import { Dialog } from '@renderer/components/ui/dialog'
import { IpcError, unwrap, useAction } from './ipc'

type WithStepUp = <T>(fn: () => Promise<T>) => Promise<T>
const StepUpContext = createContext<WithStepUp | null>(null)

/**
 * Admin actions may be answered with STEP_UP_REQUIRED by the main process. This
 * provider then asks for a fresh authenticator code and retries the action once.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null)
  const { run, pending: busy, error, setError } = useAction()

  const ask = () =>
    new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject }
      setCode('')
      setError(null)
      setOpen(true)
    })

  const withStepUp = useCallback<WithStepUp>(async (fn) => {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof IpcError) || err.code !== 'STEP_UP_REQUIRED') throw err
      await ask()
      return fn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = () => {
    setOpen(false)
    pending.current?.reject(new IpcError('CANCELLED'))
    pending.current = null
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(async () => {
      await unwrap(window.ci.security.stepUp({ code }))
      return true
    })
    if (ok) {
      setOpen(false)
      pending.current?.resolve()
      pending.current = null
    } else setCode('')
  }

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => !o && cancel()}
        title={t('stepUp.title')}
        description={t('stepUp.body')}
        footer={
          <>
            <Button variant="outline" onClick={cancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="step-up-form" disabled={busy || code.length !== 6}>
              <ShieldCheck />
              {t('stepUp.confirm')}
            </Button>
          </>
        }
      >
        <form id="step-up-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert>{error}</Alert> : null}
          <CodeInput autoFocus value={code} onChange={setCode} aria-label={t('auth.totp.codeLabel')} />
        </form>
      </Dialog>
    </StepUpContext.Provider>
  )
}

export function useStepUp(): WithStepUp {
  const ctx = useContext(StepUpContext)
  if (!ctx) throw new Error('useStepUp must be used inside StepUpProvider')
  return ctx
}
