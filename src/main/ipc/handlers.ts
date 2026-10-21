import { app } from 'electron'
import { z } from 'zod'
import { Channels } from '@shared/channels'
import type { AppInfo } from '@shared/api'
import { getDatabaseCipher } from '../db'
import { handle } from './router'

export function registerAppHandlers(): void {
  handle(Channels.appGetInfo, z.undefined(), (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    databaseCipher: getDatabaseCipher()
  }))
}
