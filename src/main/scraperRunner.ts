// Orchestrates running a scraper: pulls config + creds, invokes the scraper,
// upserts results. Used by both the IPC handler and the cron scheduler.

import { safeStorage } from 'electron'
import type { ScrapeResult } from '@shared/types'
import { logger } from '@utils/logger'
import { getSetting } from './store'
import { bulkUpsert } from './db'
import { ChalkItProScraper } from '@scrapers/ChalkItProScraper'
import { loadEncryptedCredentials } from './credentials'

let running = false
let lastRun: string | null = null

export function isRunning(): boolean {
  return running
}
export function getLastRun(): string | null {
  return lastRun
}

export async function runScrape(): Promise<ScrapeResult> {
  logger.info('[scraper] runScrape invoked')
  if (running) {
    logger.warn('[scraper] already running — returning early')
    return { success: false, count: 0, error: 'A scrape is already in progress' }
  }
  running = true
  try {
    const creds = loadEncryptedCredentials()
    if (!creds) {
      logger.warn('[scraper] no saved credentials — aborting')
      return { success: false, count: 0, error: 'No saved credentials. Open Settings → Scraper.' }
    }
    logger.info(`[scraper] credentials loaded (username=${creds.username})`)
    const config = getSetting('scraperConfig')
    logger.info(
      `[scraper] config — loginUrl=${config.loginUrl} membersUrl=${config.membersUrl}`
    )
    logger.info('[scraper] launching ChalkItProScraper…')
    const scraper = new ChalkItProScraper()
    const events = await scraper.scrape(config, creds)
    if (!events) {
      logger.warn('[scraper] scraper returned null — selectors likely invalid')
      return { success: false, count: 0, error: 'Scraper returned no events (see logs)' }
    }
    logger.info(`[scraper] scraper returned ${events.length} events`)
    if (events.length === 0) {
      return {
        success: false,
        count: 0,
        error:
          "Scraper ran but found 0 members. Check the members URL and 'memberRow' CSS selector in Settings."
      }
    }
    const res = bulkUpsert(events)
    lastRun = new Date().toISOString()
    logger.info(`[scraper] scrape OK — inserted ${res.inserted}, updated ${res.updated}`)
    return { success: true, count: res.inserted + res.updated }
  } catch (err) {
    logger.error('[scraper] scrape failed', err)
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, count: 0, error: message }
  } finally {
    running = false
    void safeStorage
  }
}
