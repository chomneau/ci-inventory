import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, isTrustedRendererUrl } from '../src/main/security/origin'
import { resolveInsideRoot } from '../src/main/security/paths'

describe('isTrustedRendererUrl', () => {
  it('accepts the packaged app origin', () => {
    expect(isTrustedRendererUrl('app://ci/index.html')).toBe(true)
    expect(isTrustedRendererUrl('app://ci/index.html#/settings')).toBe(true)
  })

  it('rejects other hosts, schemes and garbage', () => {
    expect(isTrustedRendererUrl('app://evil/index.html')).toBe(false)
    expect(isTrustedRendererUrl('file:///etc/passwd')).toBe(false)
    expect(isTrustedRendererUrl('https://ci/index.html')).toBe(false)
    expect(isTrustedRendererUrl('not a url')).toBe(false)
  })

  it('in dev, accepts only the dev server origin', () => {
    const dev = 'http://localhost:5173'
    expect(isTrustedRendererUrl('http://localhost:5173/#/items', dev)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isTrustedRendererUrl('app://ci/index.html', dev)).toBe(false)
  })
})

describe('isAllowedExternalUrl', () => {
  it('denies everything not explicitly allow-listed', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///Applications')).toBe(false)
  })
})

describe('resolveInsideRoot', () => {
  const root = path.resolve('/srv/renderer')

  it('maps normal paths into the root', () => {
    expect(resolveInsideRoot(root, '/')).toBe(path.join(root, 'index.html'))
    expect(resolveInsideRoot(root, '/assets/app.js')).toBe(path.join(root, 'assets/app.js'))
  })

  it('blocks traversal, encoded traversal, null bytes and bad encoding', () => {
    expect(resolveInsideRoot(root, '/../secret')).toBeNull()
    expect(resolveInsideRoot(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull()
    expect(resolveInsideRoot(root, '/assets/..%2f..%2fsecret')).toBeNull()
    expect(resolveInsideRoot(root, '/index.html%00.js')).toBeNull()
    expect(resolveInsideRoot(root, '/%E0%A4%A')).toBeNull()
  })
})
