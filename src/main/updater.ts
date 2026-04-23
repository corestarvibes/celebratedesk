// electron-updater wiring.
//
// In production the packaged app checks GitHub Releases on launch and then
// every 4 hours while running. When an update is downloaded electron-updater
// stages it in the local cache; `autoInstallOnAppQuit = true` means the next
// time the user quits (or the mini PC reboots), the update installs before
// the next launch. The renderer also gets an 'update-available' push so we
// can show a subtle toast.
//
// Disabled in dev because there is no packaged app to diff against — the
// `checkForUpdates()` call would fail on a missing `app-update.yml`.

import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { logger } from '@utils/logger'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

export function installUpdater(getMainWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    logger.info('updater: checking')
  })

  autoUpdater.on('update-available', (info) => {
    logger.info('updater: update available', info.version)
    const win = getMainWindow()
    if (win) win.webContents.send('update-available', { version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    logger.info('updater: up-to-date', info.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('updater: update downloaded', info.version)
    const win = getMainWindow()
    if (win) win.webContents.send('update-available', { version: info.version, ready: true })
  })

  autoUpdater.on('error', (err) => {
    // Network hiccups are non-fatal; log and move on. electron-updater will
    // retry on the next scheduled check.
    logger.warn('updater error', err?.message ?? err)
  })

  if (is.dev) {
    logger.info('updater: skipped (dev mode)')
    return
  }

  // Check once on launch, then every 4 hours. The mini PC may run for weeks
  // at a time so polling matters — a release published Tuesday morning should
  // land by Tuesday evening, not wait for a manual reboot.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    logger.warn('updater: initial check failed', err?.message ?? err)
  })
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logger.warn('updater: periodic check failed', err?.message ?? err)
    })
  }, FOUR_HOURS_MS)
}

export function triggerUpdateCheck(): void {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    logger.warn('updater: manual check failed', err?.message ?? err)
  })
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
