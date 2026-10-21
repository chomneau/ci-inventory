import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useIsAdmin } from './hooks'

/** Hides admin pages from other roles. The main process enforces the same rule on every call. */
export function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : <Navigate to="/" replace />
}
