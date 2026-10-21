import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@renderer/lib/ipc'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => unwrap(window.ci.settings.get()) })
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => unwrap(window.ci.users.list()) })
}

export function useAudit(q: { search?: string }) {
  return useQuery({ queryKey: ['audit', q], queryFn: () => unwrap(window.ci.audit.list({ ...q, limit: 300 })) })
}

export function useIsAdmin(): boolean {
  return useCurrentUser().role === 'admin'
}
