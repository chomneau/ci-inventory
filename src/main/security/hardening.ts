import { app, session, shell, type Session } from 'electron'
import { isAllowedExternalUrl } from './origin'
import { SECURITY_HEADERS, contentSecurityPolicy } from './csp'

/**
 * Applies navigation, window-open and webview restrictions to every
 * webContents the app ever creates. Call once, before any window exists.
 */
export function installWebContentsGuards(isTrustedUrl: (url: string) => boolean): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => {
      if (!isTrustedUrl(event.url)) event.preventDefault()
    })
    contents.on('will-redirect', (event) => {
      if (!isTrustedUrl(event.url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

/** Deny-by-default for camera, mic, geolocation, notifications prompts, USB, HID, etc. */
export function lockDownPermissions(ses: Session, isTrustedUrl: (url: string) => boolean): void {
  // Clipboard write is allowed so users can copy recovery codes and SKUs.
  const allowed = new Set(['clipboard-sanitized-write'])
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed.has(permission) && isTrustedUrl(contents.getURL()))
  })
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return allowed.has(permission) && isTrustedUrl(requestingOrigin)
  })
  ses.setDevicePermissionHandler(() => false)
}

/** In development the renderer comes from the Vite server, so CSP is added here. */
export function applyDevCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy(true)],
        ...Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([k, v]) => [k, [v]]))
      }
    })
  })
}
