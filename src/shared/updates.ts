export interface UpdateStatus {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  version?: string
  percent?: number
  /** True when the update must be downloaded by hand (unsigned macOS builds). */
  manual?: boolean
  /** Why updates are off: dev build, or turned off for this distribution (private repository). */
  reason?: 'development' | 'not-configured'
}
