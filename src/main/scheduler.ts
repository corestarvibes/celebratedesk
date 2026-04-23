// Cron jobs: periodic scrape + nightly day-change notification.
// node-cron v3/v4 — schedule strings follow POSIX cron format.

import cron, { type ScheduledTask } from 'node-cron'
import { logger } from '@utils/logger'
import { getSetting } from './store'
import { runScrape } from './scraperRunner'
import { getAllEvents } from './db'
import { getDaysUntil, getNextOccurrence, todayInTz } from '@utils/dateHelpers'
import { notifySummary } from './notifications'
import type { BrowserWindow } from 'electron'

let scrapeTask: ScheduledTask | null = null
let dailyTask: ScheduledTask | null = null

export function startSchedulers(getMainWindow: () => BrowserWindow | null): void {
  stopSchedulers()

  const hours = Math.max(1, getSetting('scrapeIntervalHours') || 24)
  // Only run the scheduled scrape when the user has explicitly chosen
  // the scraper as their data source. CSV / manual users shouldn't hit
  // ChalkItPro every 24h in the background.
  scrapeTask = cron.schedule(`7 */${hours} * * *`, async () => {
    if (getSetting('dataSource') !== 'scrape') {
      logger.info('[scheduler] scheduled scrape skipped (dataSource != "scrape")')
      return
    }
    try {
      const res = await runScrape()
      const win = getMainWindow()
      if (win) win.webContents.send('scrape-complete', res)
    } catch (err) {
      logger.error('scheduled scrape failed', err)
    }
  })

  // Daily 00:05 local time: push "day-changed" and summary notification
  dailyTask = cron.schedule('5 0 * * *', () => {
    const win = getMainWindow()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const todayStr = todayInTz(tz)
    const events = getAllEvents()
    let todayCount = 0
    let weekCount = 0
    for (const ev of events) {
      const next = getNextOccurrence(ev.date, ev.recurring, tz)
      const days = getDaysUntil(next, tz)
      if (days === 0) todayCount += 1
      if (days >= 0 && days <= 7) weekCount += 1
    }
    notifySummary(todayCount, weekCount)
    if (win) win.webContents.send('day-changed', { today: todayStr })
  })
}

export function stopSchedulers(): void {
  if (scrapeTask) {
    scrapeTask.stop()
    scrapeTask = null
  }
  if (dailyTask) {
    dailyTask.stop()
    dailyTask = null
  }
}
