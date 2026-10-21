import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { protocol } from 'electron'
import { APP_HOST, APP_SCHEME } from './origin'
import { resolveInsideRoot } from './paths'
import { SECURITY_HEADERS, contentSecurityPolicy } from './csp'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

/** Must run before `app.whenReady()`. */
export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Serves the built renderer from `rendererDir` with a strict CSP on every response. */
export function registerAppProtocol(rendererDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (request.method !== 'GET' || url.host !== APP_HOST) {
      return new Response('Not found', { status: 404 })
    }
    const filePath = resolveInsideRoot(rendererDir, url.pathname)
    if (!filePath) return new Response('Forbidden', { status: 403 })

    let body: Buffer
    try {
      body = await readFile(filePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Security-Policy': contentSecurityPolicy(false),
        ...SECURITY_HEADERS
      }
    })
  })
}
