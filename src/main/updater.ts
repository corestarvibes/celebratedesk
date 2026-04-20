// electron-updater scaffold. Wired end-to-end, but the checkForUpdates call
// is commented out until electron-builder publish settings are configured.
// To enable: set `publish` in electron-builder.yml and uncomment below.

import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import { logger } from '@utils/logger'

export function installUpdater(getMainWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    logger.info('update available', info.version)
    const win = getMainWindow()
    if (win) win.webContents.send('update-available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('update downloaded', info.version)
    const win = getMainWindow()
    if (win) win.webContents.send('update-available', { version: info.version, ready: true })
  })

  autoUpdater.on('error', (err) => {
    logger.warn('updater error', err?.message ?? err)
  })

  // To enable auto-updates, configure electron-builder publish settings
  // and uncomment the line below.
  // autoUpdater.checkForUpdatesAndNotify()
}

export function triggerUpdateCheck(): void {
  // autoUpdater.checkForUpdatesAndNotify()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
