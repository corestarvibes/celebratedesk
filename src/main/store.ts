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
  // ADD NEW SETTING HERE — slideshow order includes the 3 new views.
  slideshowViews: [
    'today',
    'motm',
    'attendance',
    'upcoming',
    'weekly',
    'monthly',
    'qrcodes'
  ],
  lastCsvPath: null,
  brandName: 'CelebrateDesk',
  logoPath: null,
  accentColor: '#f59e0b',
  // ADD NEW SETTING HERE — remembered attendance month (defaults to current).
  attendanceViewMonth: null,
  // ADD NEW SETTING HERE — editable QR codes displayed in QRCodesView.
  qrCodes: DEFAULT_QR_CODES,
  scraperConfig: {
    loginUrl: 'https://app.chalkitpro.com/login',
    membersUrl: 'https://app.chalkitpro.com/members',
    scrapeIntervalHours: 24,
    selectors: {
      usernameField: '#email',
      passwordField: '#password',
      submitButton: 'button[type="submit"]',
      memberRow: '.member-row',
      memberName: '.member-name',
      memberBirthday: '[data-birthday]',
      memberAnniversary: '[data-anniversary]'
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

/**
 * Migrate stored settings at launch:
 * - Ensure slideshowViews contains every view id that ships by default.
 *   (Users that ran an older build have a shorter array; new views added in
 *   later releases would otherwise never appear in the rotation.)
 * - Ensure every default QR code entry exists (by id) so first-launch users
 *   of an upgrade get any new entries we shipped.
 */
export function migrateSettings(): void {
  const current = getAllSettings()

  // Union slideshowViews with the current defaults, preserving the user's order.
  const wantedViews = defaults.slideshowViews
  const userViews = Array.isArray(current.slideshowViews) ? current.slideshowViews : []
  const missing = wantedViews.filter((v) => !userViews.includes(v))
  if (missing.length > 0) {
    const merged = [...userViews, ...missing]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(store as any).set('slideshowViews', merged)
    // eslint-disable-next-line no-console
    console.log('[migrate] slideshowViews: added missing ids:', missing)
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
