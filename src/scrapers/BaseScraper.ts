// ADD NEW DATA SOURCE HERE — extend BaseScraper, then register the concrete
// class in src/main/scraperRunner.ts (or a registry map there).

import type { CelebEvent, Credentials, ScraperConfig } from '@shared/types'

export abstract class BaseScraper {
  abstract name: string
  abstract scrape(config: ScraperConfig, credentials: Credentials): Promise<CelebEvent[] | null>
  protected abstract validateSelectors(config: ScraperConfig): boolean
}

/**
 * Locate the system's installed Chrome/Chromium. Returns null if none found.
 * We use puppeteer-core + the user's existing browser deliberately — bundling
 * full puppeteer would add ~280MB of Chromium to every install.
 */
export function findSystemChrome(): string | null {
  const { existsSync } = require('fs') as typeof import('fs')
  const candidates: string[] =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files\\Chromium\\Application\\chrome.exe'
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}
