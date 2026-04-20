// Chalk It Pro scraper. Uses puppeteer-core + system Chrome (no bundled Chromium).
// Selectors are editable in Settings → Scraper Config so this works without a recompile
// even if Chalk It Pro tweaks its HTML.

import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { v4 as uuidv4 } from 'uuid'
import type { CelebEvent, Credentials, ScraperConfig } from '@shared/types'
import { logger } from '@utils/logger'
import { BaseScraper, findSystemChrome } from './BaseScraper'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (DATE_RE.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export class ChalkItProScraper extends BaseScraper {
  name = 'chalkitpro'

  protected validateSelectors(config: ScraperConfig): boolean {
    const s = config.selectors
    return Boolean(
      s.usernameField &&
        s.passwordField &&
        s.submitButton &&
        s.memberRow &&
        s.memberName &&
        (s.memberBirthday || s.memberAnniversary)
    )
  }

  async scrape(config: ScraperConfig, credentials: Credentials): Promise<CelebEvent[] | null> {
    if (!this.validateSelectors(config)) {
      logger.warn('ChalkItProScraper: selectors incomplete')
      return null
    }

    const executablePath = findSystemChrome()
    if (!executablePath) {
      logger.warn('ChalkItProScraper: no system Chrome/Chromium found')
      throw new Error(
        'Scraping requires Google Chrome (or Chromium / Edge) to be installed on this machine.'
      )
    }

    let browser: Browser | null = null
    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      })
      const page: Page = await browser.newPage()
      page.setDefaultNavigationTimeout(45_000)
      page.setDefaultTimeout(30_000)

      await page.goto(config.loginUrl, { waitUntil: 'networkidle2' })
      await page.waitForSelector(config.selectors.usernameField)
      await page.type(config.selectors.usernameField, credentials.username, { delay: 20 })
      await page.type(config.selectors.passwordField, credentials.password, { delay: 20 })
      const submit = await page.$(config.selectors.submitButton)
      if (!submit) throw new Error('Could not find login submit button — check selectors.')
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => undefined),
        submit.click()
      ])

      if (page.url().includes('/login')) {
        throw new Error('Login failed — incorrect credentials or updated login flow.')
      }

      await page.goto(config.membersUrl, { waitUntil: 'networkidle2' })
      await page.waitForSelector(config.selectors.memberRow).catch(() => undefined)

      const rowsData = await page.$$eval(
        config.selectors.memberRow,
        (nodes, s) => {
          const q = (el: Element, sel: string): string | null => {
            if (!sel) return null
            const match = (el.matches(sel) ? el : el.querySelector(sel)) as HTMLElement | null
            if (!match) return null
            if (match.dataset && match.dataset.birthday) return match.dataset.birthday
            return (match.textContent || '').trim() || match.getAttribute('content') || null
          }
          return nodes.map((n) => ({
            name: q(n, s.memberName),
            birthday: q(n, s.memberBirthday),
            anniversary: q(n, s.memberAnniversary)
          }))
        },
        config.selectors
      )

      const out: CelebEvent[] = []
      const now = new Date().toISOString()
      for (const row of rowsData) {
        const name = (row.name || '').trim()
        if (!name) continue
        const bday = normalizeDate(row.birthday)
        const anni = normalizeDate(row.anniversary)
        if (bday) {
          out.push({
            id: uuidv4(),
            name,
            type: 'birthday',
            date: bday,
            recurring: true,
            source: 'scrape',
            lastScraped: now,
            createdAt: now,
            updatedAt: now
          })
        }
        if (anni) {
          out.push({
            id: uuidv4(),
            name,
            type: 'anniversary',
            date: anni,
            recurring: true,
            source: 'scrape',
            lastScraped: now,
            createdAt: now,
            updatedAt: now
          })
        }
      }
      return out
    } finally {
      if (browser) {
        try {
          await browser.close()
        } catch {
          /* ignore */
        }
      }
    }
  }
}
