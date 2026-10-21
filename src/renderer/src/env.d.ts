import type { CiApi } from '@shared/api'

declare global {
  interface Window {
    ci: CiApi
  }
}
