/** Custom scheme the production renderer is served from: app://ci/index.html */
export const APP_SCHEME = 'app'
export const APP_HOST = 'ci'
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`

/**
 * True when `url` belongs to our own renderer. Node's URL reports origin "null"
 * for non-special schemes, so the custom scheme is matched on protocol + host.
 */
export function isTrustedRendererUrl(url: string, devServerUrl?: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (devServerUrl) {
    return parsed.origin === new URL(devServerUrl).origin
  }
  return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST
}

/** Hosts the app may open in the user's default browser. Keep this list short. */
const EXTERNAL_HOST_ALLOWLIST: readonly string[] = []

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && EXTERNAL_HOST_ALLOWLIST.includes(parsed.hostname)
  } catch {
    return false
  }
}
