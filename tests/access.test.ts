import { describe, expect, it } from 'vitest'
import type { PublicUser } from '@shared/auth'
import { checkAccess } from '../src/main/ipc/access'

const user = (role: PublicUser['role']): PublicUser => ({ id: 1, email: 'a@ci.org', displayName: 'A', role })

describe('checkAccess', () => {
  it('lets anyone call public handlers', () => {
    expect(checkAccess('public', null)).toBeNull()
  })
  it('requires a signed-in user by default', () => {
    expect(checkAccess('authenticated', null)).toBe('UNAUTHENTICATED')
    expect(checkAccess('authenticated', user('viewer'))).toBeNull()
  })
  it('enforces roles', () => {
    expect(checkAccess(['admin'], user('storekeeper'))).toBe('FORBIDDEN')
    expect(checkAccess(['admin', 'storekeeper'], user('storekeeper'))).toBeNull()
    expect(checkAccess(['admin'], null)).toBe('UNAUTHENTICATED')
  })
})
