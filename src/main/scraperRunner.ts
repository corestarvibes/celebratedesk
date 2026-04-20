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
  if (running) return { success: false, count: 0, error: 'A scrape is already in progress' }
  running = true
  try {
    const creds = loadEncryptedCredentials()
    if (!creds) {
      return { success: false, count: 0, error: 'No saved credentials. Open Settings → Scraper.' }
    }
    const config = getSetting('scraperConfig')
    const scraper = new ChalkItProScraper()
    const events = await scraper.scrape(config, creds)
    if (!events) {
      return { success: false, count: 0, error: 'Scraper returned no events (see logs)' }
    }
    const res = bulkUpsert(events)
    lastRun = new Date().toISOString()
    logger.info(`scrape OK — inserted ${res.inserted}, updated ${res.updated}`)
    return { success: true, count: res.inserted + res.updated }
  } catch (err) {
    logger.error('scrape failed', err)
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, count: 0, error: message }
  } finally {
    running = false
    void safeStorage // keep TS happy about the import being retained
  }
}
