import type { PublicUser, Role } from '@shared/auth'

/** 'public' = no sign-in needed; 'authenticated' = any signed-in user; Role[] = only those roles. */
export type Access = 'public' | 'authenticated' | readonly Role[]

export function checkAccess(access: Access, user: PublicUser | null): 'UNAUTHENTICATED' | 'FORBIDDEN' | null {
  if (access === 'public') return null
  if (!user) return 'UNAUTHENTICATED'
  if (access === 'authenticated') return null
  return access.includes(user.role) ? null : 'FORBIDDEN'
}
