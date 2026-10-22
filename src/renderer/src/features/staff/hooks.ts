import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@renderer/lib/ipc'

export function useStaff(includeArchived = false) {
  return useQuery({ queryKey: ['staff', includeArchived], queryFn: () => unwrap(window.ci.staff.list({ includeArchived })) })
}

export function useStaffMember(id: number) {
  return useQuery({ queryKey: ['staff-member', id], queryFn: () => unwrap(window.ci.staff.get({ id })), enabled: id > 0 })
}

/** Two-letter avatar text. */
export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : (parts[0]?.[1] ?? ''))).toUpperCase()
}
