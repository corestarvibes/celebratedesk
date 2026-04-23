// Chalk It Pro scraper. Uses puppeteer-core + system Chrome (no bundled Chromium).
// Selectors are editable in Settings → Scraper Config so this works without a recompile
// even if Chalk It Pro tweaks its HTML.

import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { v4 as uuidv4 } from 'uuid'
import { app, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
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
    logger.info('[scraper] ChalkItProScraper.scrape() entered')
    if (!this.validateSelectors(config)) {
      logger.warn('[scraper] ChalkItProScraper: selectors incomplete')
      return null
    }

    const executablePath = findSystemChrome()
    if (!executablePath) {
      logger.warn('[scraper] No system Chrome/Chromium found')
      throw new Error(
        'Scraping requires Google Chrome (or Chromium / Edge) to be installed on this machine.'
      )
    }
    logger.info(`[scraper] Using browser at: ${executablePath}`)

    let browser: Browser | null = null
    try {
      logger.info('[scraper] Launching headless browser…')
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      })
      logger.info('[scraper] Browser launched — opening page')
      const page: Page = await browser.newPage()
      page.setDefaultNavigationTimeout(45_000)
      page.setDefaultTimeout(30_000)

      logger.info(`[scraper] Navigating to login: ${config.loginUrl}`)
      await page.goto(config.loginUrl, { waitUntil: 'networkidle2' })
      logger.info(`[scraper] Waiting for username field: ${config.selectors.usernameField}`)
      try {
        await page.waitForSelector(config.selectors.usernameField, { timeout: 20_000 })
      } catch (err) {
        // Dump a screenshot so the user can see what ChalkItPro actually
        // rendered. Written to <userData>/scraper-debug/login-TIMESTAMP.png.
        const dir = join(app.getPath('userData'), 'scraper-debug')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        const shot = join(dir, `login-${Date.now()}.png`)
        try {
          await page.screenshot({ path: shot as `${string}.png`, fullPage: true })
          logger.warn(`[scraper] saved debug screenshot: ${shot}`)
          // Auto-open the screenshot in the default image viewer so the user
          // can see what ChalkItPro rendered without hunting through folders.
          void shell.openPath(shot)
        } catch (shotErr) {
          logger.warn(`[scraper] screenshot save/open failed: ${String(shotErr)}`)
        }
        const html = await page.content().catch(() => '')
        const inputs = html.match(/<input[^>]*>/gi)?.slice(0, 6) ?? []
        logger.warn(`[scraper] first input tags on page: ${JSON.stringify(inputs)}`)
        throw new Error(
          `Couldn't find the username field with selector "${config.selectors.usernameField}". ` +
            `A screenshot was saved to ${shot}. ` +
            `Open the login page in your browser, inspect the email input, and paste its CSS selector into Settings → Scraper Config → Selectors → usernameField.`
        )
      }
      logger.info('[scraper] Typing username')
      await page.type(config.selectors.usernameField, credentials.username, { delay: 20 })

      // ChalkItPro uses a two-step login: email first, then a Next/Continue
      // button reveals the password field. Detect which pattern we're on by
      // checking for the password field immediately. If it's already visible
      // (single-step form), proceed. If not (two-step), press Enter to
      // advance, which is equivalent to clicking the Next button and works
      // whether the user's primary browser is React, Auth0, Google, etc.
      let hasPasswordNow = false
      try {
        await page.waitForSelector(config.selectors.passwordField, {
          timeout: 1500,
          visible: true
        })
        hasPasswordNow = true
      } catch {
        // expected for two-step forms
      }

      if (!hasPasswordNow) {
        logger.info(
          '[scraper] password field not visible yet — two-step form detected, pressing Enter to advance'
        )
        await page.keyboard.press('Enter')
        // Now wait up to 20s for the password field to appear.
        try {
          await page.waitForSelector(config.selectors.passwordField, {
            timeout: 20_000,
            visible: true
          })
          logger.info('[scraper] password field appeared after advancing')
        } catch (err) {
          logger.warn('[scraper] password field never appeared after Next')
          // Screenshot for diagnostics.
          const dir = join(app.getPath('userData'), 'scraper-debug')
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          const shot = join(dir, `step2-${Date.now()}.png`)
          try {
            await page.screenshot({ path: shot as `${string}.png`, fullPage: true })
            void shell.openPath(shot)
          } catch {
            /* ignore */
          }
          throw new Error(
            `Entered the username but the password field never appeared. ChalkItPro may be showing an error message (wrong email?) or using a different flow. Screenshot: ${shot}. Error: ${String(err)}`
          )
        }
      } else {
        logger.info('[scraper] password field visible — single-step form')
      }

      logger.info('[scraper] Typing password')
      await page.type(config.selectors.passwordField, credentials.password, { delay: 20 })

      const preLoginUrl = page.url()
      logger.info('[scraper] Submitting login — pressing Enter in password field')
      // Press Enter first (universal, works with React forms). Some SPAs
      // ignore programmatic button clicks but always honor the keyboard
      // "submit" event when the password input is focused.
      await page.keyboard.press('Enter')
      // Also try clicking the submit button as a belt-and-suspenders.
      const submit = await page.$(config.selectors.submitButton)
      if (submit) {
        logger.info('[scraper] Also clicking submit button')
        await submit.click().catch(() => undefined)
      }

      // SPA-aware wait: ChalkItPro uses client-side routing after login, so
      // page.waitForNavigation() doesn't fire. Poll for (a) the URL changing
      // off /login, OR (b) `document.body` containing something other than
      // the login form. 30s cap.
      logger.info('[scraper] Waiting for post-login URL change (SPA)…')
      try {
        await page.waitForFunction(
          (originalUrl: string) =>
            window.location.href !== originalUrl &&
            !window.location.pathname.includes('/login'),
          { timeout: 30_000 },
          preLoginUrl
        )
      } catch {
        logger.warn('[scraper] URL never changed after submit — login may have failed silently')
      }
      logger.info(`[scraper] After login, URL is: ${page.url()}`)

      if (page.url().includes('/login')) {
        // Didn't advance off /login. Could be wrong creds, could be reCAPTCHA.
        // Capture a screenshot AND any visible error text so user can see.
        const dir = join(app.getPath('userData'), 'scraper-debug')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        const shot = join(dir, `login-failed-${Date.now()}.png`)
        let errorText = ''
        try {
          await page.screenshot({ path: shot as `${string}.png`, fullPage: true })
          void shell.openPath(shot)
          logger.warn(`[scraper] login-failed screenshot: ${shot}`)
          // Scrape any visible error message text on the page.
          errorText = await page.evaluate(() => {
            // 1. Modal / dialog headings (ChalkItPro uses these).
            const modalSelectors = [
              '[role="dialog"] h1, [role="dialog"] h2, [role="dialog"] h3',
              '[role="alertdialog"] h1, [role="alertdialog"] h2',
              '.MuiDialog-root h1, .MuiDialog-root h2, .MuiDialog-root h3',
              '.modal h1, .modal h2, .modal h3'
            ]
            for (const sel of modalSelectors) {
              const els = document.querySelectorAll(sel)
              for (const el of Array.from(els)) {
                const t = (el.textContent || '').trim()
                if (t && t.length < 200) return t
              }
            }
            // 2. Inline form error elements.
            const inlineSelectors = [
              '[role="alert"]',
              '.error',
              '.alert-danger',
              '.MuiFormHelperText-error',
              '.text-red-500',
              '.text-danger'
            ]
            for (const sel of inlineSelectors) {
              const els = document.querySelectorAll(sel)
              for (const el of Array.from(els)) {
                const t = (el.textContent || '').trim()
                if (t) return t
              }
            }
            // 3. Keyword scan as a last resort.
            const keywords =
              /incorrect|invalid|captcha|verify|locked|wrong|unable|try again|not found|doesn't match|no account/i
            const all = Array.from(document.querySelectorAll('span, div, p, h1, h2, h3'))
            for (const el of all) {
              const t = (el.textContent || '').trim()
              if (t && t.length < 200 && keywords.test(t)) return t
            }
            return ''
          })
          logger.warn(`[scraper] visible error text on page: ${JSON.stringify(errorText)}`)
        } catch (shotErr) {
          logger.warn(`[scraper] screenshot failed: ${String(shotErr)}`)
        }
        throw new Error(
          errorText
            ? `Login failed — page shows: "${errorText}". Screenshot: ${shot}`
            : `Login didn't advance past /login. Possible causes: (1) wrong password, (2) reCAPTCHA challenge (ChalkItPro loads Stax captcha + Google GSI on login — headless automation may be blocked). Screenshot: ${shot}`
        )
      }

      logger.info(`[scraper] Navigating to members: ${config.membersUrl}`)
      await page.goto(config.membersUrl, { waitUntil: 'networkidle2' })
      logger.info(`[scraper] Waiting for member rows: ${config.selectors.memberRow}`)
      await page.waitForSelector(config.selectors.memberRow).catch((e) => {
        logger.warn(`[scraper] memberRow selector timed out: ${String(e)}`)
      })

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
      logger.info(
        `[scraper] Extracted ${rowsData.length} rows. Sample: ${JSON.stringify(rowsData.slice(0, 3))}`
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
