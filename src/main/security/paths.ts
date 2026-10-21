import path from 'node:path'

/**
 * Maps a request pathname onto a file inside `root`, or returns null if the
 * path is malformed or escapes `root` (path traversal).
 */
export function resolveInsideRoot(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const relativePath = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\/+/, '')
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relativePath)
  const rel = path.relative(resolvedRoot, target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return target
}
