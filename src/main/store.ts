// electron-store wrapper. ADD NEW SETTING HERE by extending the defaults + schema.
// electron-store v8 is CJS — required (not dynamic-imported) deliberately.

// eslint-disable-next-line @typescript-eslint/no-var-requires
import Store from 'electron-store'
import type { AppSettings, QRCodeEntry } from '@shared/types'

// ADD NEW SETTING HERE — default QR code entries.
const DEFAULT_QR_CODES: QRCodeEntry[] = [
  {
    id: 'qr-google-reviews',
    icon: '🌟',
    label: 'Google Reviews',
    url: 'https://g.page/r/CS5CD-aoJqoIEBM/review',
    includeInSlideshow: true
  },
  {
    id: 'qr-free-trial',
    icon: '🎯',
    label: 'Free Trial Class',
    url: 'https://app.chalkitpro.com/dropIns/626/13710/x',
    includeInSlideshow: true
  },
  {
    id: 'qr-photo-library',
    icon: '📸',
    label: 'Photo Library',
    url: 'https://drive.google.com/drive/folders/1j5Khnigxl5bUYzD2A0Hv3WRxPkWcSlLt?usp=drive_link',
    includeInSlideshow: true
  },
  {
    id: 'qr-thorne-dispensary',
    icon: '💊',
    label: 'Thorne Dispensary',
    url: 'https://www.thorne.com/u/OTG',
    includeInSlideshow: true
  }
]

const defaults: AppSettings = {
  dataSource: 'manual',
  slideshowInterval: 30,
  scrapeIntervalHours: 24,
  theme: 'auto',
  alwaysOnTop: false,
  startMinimized: false,
  launchAtLogin: false,
  notificationsEnabled: true,
  notifyDaysAhead: 7,
  activeView: 'today',
  slideshowActive: false,
  // Slideshow rotation order. Matches the bottom-nav order from VIEW_REGISTRY.
  slideshowViews: [
    'today',
    'motm',
    'events',
    'attendance',
    'weekly',
    'monthly',
    'qrcodes'
  ],
  lastCsvPath: null,
  brandName: 'CelebrateDesk',
  logoPath: null,
  accentColor: '#38bdf8',
  // ADD NEW SETTING HERE — remembered attendance month (defaults to current).
  attendanceViewMonth: null,
  // ADD NEW SETTING HERE — editable QR codes displayed in QRCodesView.
  qrCodes: DEFAULT_QR_CODES,
  scraperConfig: {
    loginUrl: 'https://app.chalkitpro.com/login',
    membersUrl: 'https://app.chalkitpro.com/members',
    scrapeIntervalHours: 24,
    // Each selector accepts a CSS selector LIST (comma-separated). Puppeteer
    // resolves to the first element that matches, so we can hedge against
    // ChalkItPro's React-generated IDs changing.
    selectors: {
      usernameField:
        'input[type="email"], input[name="email"], input[autocomplete="username"], input[name="username"], #email',
      passwordField:
        'input[type="password"], input[name="password"], input[autocomplete="current-password"], #password',
      submitButton:
        'button[type="submit"], input[type="submit"], button[aria-label*="sign in" i]',
      memberRow: '.member-row, [data-member-row], tr.member, li.member',
      memberName: '.member-name, [data-member-name], .name',
      memberBirthday: '[data-birthday], .birthday, .dob',
      memberAnniversary: '[data-anniversary], .anniversary, .member-since'
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const store: Store<AppSettings> = new (Store as any)({
  name: 'celebratedesk-settings',
  defaults
})

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (store as any).get(key) as AppSettings[K]
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).set(key, value)
}

export function getAllSettings(): AppSettings {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (store as any).store as AppSettings
}

/** View IDs that used to exist but have been removed. If the stored
 *  slideshowViews contains any of these, we treat the stored array as
 *  stale and reset to the current defaults. */
const REMOVED_VIEW_IDS = ['gallery', 'upcoming']

/**
 * Migrate stored settings at launch:
 * - slideshowViews:
 *   - If it contains a REMOVED view id, reset entirely to the current
 *     defaults (stale upgrade path).
 *   - Otherwise just union in any missing defaults.
 * - qrCodes: preserve customizations, add any missing default ids.
 */
export function migrateSettings(): void {
  const current = getAllSettings()
  const wantedViews = defaults.slideshowViews
  const userViews = Array.isArray(current.slideshowViews) ? current.slideshowViews : []

  const hasRemoved = userViews.some((id) => REMOVED_VIEW_IDS.includes(id))
  if (hasRemoved) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(store as any).set('slideshowViews', [...wantedViews])
    // eslint-disable-next-line no-console
    console.log('[migrate] slideshowViews: stale — reset to defaults', wantedViews)
  } else {
    const missing = wantedViews.filter((v) => !userViews.includes(v))
    if (missing.length > 0) {
      const merged = [...userViews, ...missing]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store as any).set('slideshowViews', merged)
      // eslint-disable-next-line no-console
      console.log('[migrate] slideshowViews: added missing ids:', missing)
    }
  }

  // Accent color — if the stored value matches the PREVIOUS default (amber
  // #f59e0b), reset to the current default. Otherwise the user has set a
  // custom color and we leave it alone.
  const LEGACY_AMBER = '#f59e0b'
  if (
    typeof current.accentColor === 'string' &&
    current.accentColor.toLowerCase() === LEGACY_AMBER
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(store as any).set('accentColor', defaults.accentColor)
    // eslint-disable-next-line no-console
    console.log(
      '[migrate] accentColor: stale (amber) — reset to brand default',
      defaults.accentColor
    )
  }

  // Scraper selectors — the original defaults (#email, #password, .member-row)
  // were a bad guess for ChalkItPro's React app. Replace any stored value that
  // still matches the old defaults with the current (multi-selector) defaults.
  // Users who customized their selectors keep their overrides.
  const LEGACY_SCRAPER_DEFAULTS: Record<string, string> = {
    usernameField: '#email',
    passwordField: '#password',
    submitButton: 'button[type="submit"]',
    memberRow: '.member-row',
    memberName: '.member-name',
    memberBirthday: '[data-birthday]',
    memberAnniversary: '[data-anniversary]'
  }
  const curCfg = current.scraperConfig
  if (curCfg && curCfg.selectors) {
    const updated = { ...curCfg.selectors }
    let changed = false
    for (const [key, legacy] of Object.entries(LEGACY_SCRAPER_DEFAULTS)) {
      const k = key as keyof typeof updated
      if (updated[k] === legacy) {
        updated[k] =
          (defaults.scraperConfig.selectors as unknown as Record<string, string>)[key] ??
          updated[k]
        changed = true
      }
    }
    if (changed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store as any).set('scraperConfig', { ...curCfg, selectors: updated })
      // eslint-disable-next-line no-console
      console.log('[migrate] scraperConfig.selectors: replaced legacy defaults')
    }
    // Always log the current selectors so we can see them even when no
    // migration runs — makes diagnosing selector issues one-pass.
    const after = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (store as any).get('scraperConfig') as typeof curCfg
    ).selectors
    // eslint-disable-next-line no-console
    console.log('[scraper] current selectors on startup:', after)
  }

  // QR codes — preserve the user's customizations but add any missing default ids.
  const wantedQr = defaults.qrCodes
  const userQr = Array.isArray(current.qrCodes) ? current.qrCodes : []
  const userQrIds = new Set(userQr.map((q) => q.id))
  const missingQr = wantedQr.filter((q) => !userQrIds.has(q.id))
  if (missingQr.length > 0) {
    const merged = [...userQr, ...missingQr]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(store as any).set('qrCodes', merged)
    // eslint-disable-next-line no-console
    console.log('[migrate] qrCodes: added missing defaults:', missingQr.map((q) => q.id))
  }
}
