import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { AuthStatus } from '@shared/auth'
import { unwrap } from '@renderer/lib/ipc'
import { clearQueryCache } from '@renderer/lib/query'

interface AuthContextValue {
  status: AuthStatus
  setStatus: (s: AuthStatus) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Mirrors the main process's auth status; main pushes changes (idle lock, OS lock...). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)

  useEffect(() => {
    const unsubscribe = window.ci.auth.onStatusChanged((next) => {
      // Never keep one session's inventory data around for the next.
      if (next.stage !== 'signed_in') clearQueryCache()
      setStatus(next)
    })
    unwrap(window.ci.auth.getStatus())
      .then(setStatus)
      .catch(() => setStatus({ stage: 'signed_out' }))
    return unsubscribe
  }, [])

  if (!status) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <AuthContext.Provider value={{ status, setStatus }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** The signed-in user. Only use below <AuthGate>, where a user is guaranteed. */
export function useCurrentUser() {
  const { status } = useAuth()
  if (status.stage !== 'signed_in') throw new Error('No signed-in user')
  return status.user
}
