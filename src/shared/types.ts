// ADD NEW EVENT TYPE HERE — extend this union and update DB CHECK constraint in src/main/db.ts
export type EventType = 'birthday' | 'anniversary' | 'event' | 'custom'

export interface CelebEvent {
  id: string
  name: string
  type: EventType
  /** Stored as UTC ISO date string: "YYYY-MM-DD" (no time component). */
  date: string
  recurring: boolean
  notes?: string
  /** Absolute local path OR https:// URL */
  photo_url?: string
  source: 'manual' | 'csv' | 'scrape'
  lastScraped?: string
  createdAt: string
  updatedAt: string
  // Added in DB migration 3 — primarily used by the Events view but available on all rows.
  /** Multi-day events: YYYY-MM-DD end date. */
  end_date?: string
  /** Free-form location string. */
  location?: string
  /** URL rendered as a QR code on the Events view. */
  event_url?: string
  // Added in DB migration 4 (v1.1.3).
  /** Free-form times line shown under the date. e.g. "6:00am, 7:30am, 9:00am" */
  times?: string
  /** Override for the QR code label. e.g. "Buy Now", "Register Here", "Learn More".
   *  When empty/null the Events view falls back to the auto label. */
  qr_label?: string
}

/** Computed at read time — never stored. */
export interface CelebEventComputed extends CelebEvent {
  /** YYYY-MM-DD in system local timezone. */
  nextOccurrence: string
  /** 0 = today. */
  daysUntil: number
  /** Completed years, only for birthdays. */
  age?: number
  /** Years since startDate (for anniversaries). */
  yearsCount?: number
}

export interface ScraperSelectors {
  usernameField: string
  passwordField: string
  submitButton: string
  memberRow: string
  memberName: string
  memberBirthday: string
  memberAnniversary: string
}

export interface ScraperConfig {
  loginUrl: string
  membersUrl: string
  scrapeIntervalHours: number
  selectors: ScraperSelectors
}

export interface BrandSettings {
  brandName: string
  logoPath: string | null
  accentColor: string
}

export interface AppSettings {
  dataSource: 'manual' | 'csv' | 'scrape'
  slideshowInterval: number
  scrapeIntervalHours: number
  theme: 'auto' | 'dark' | 'light'
  alwaysOnTop: boolean
  startMinimized: boolean
  launchAtLogin: boolean
  notificationsEnabled: boolean
  notifyDaysAhead: number
  activeView: string
  slideshowActive: boolean
  slideshowViews: string[]
  lastCsvPath: string | null
  brandName: string
  logoPath: string | null
  accentColor: string
  attendanceViewMonth: string | null
  qrCodes: QRCodeEntry[]
  scraperConfig: ScraperConfig
  // Mac-only writer flag. When true, every IPC mutation triggers a
  // debounced snapshot push to the Drive sync folder.
  syncEnabled: boolean
  /** Optional override for the Drive sync folder path. Empty -> auto-detect. */
  syncFolderOverride: string
}

// ───── Sync ─────

export type SyncStatus =
  | { kind: 'disabled' }
  | { kind: 'idle'; folder: string; lastSnapshot: { timestamp: number; sha256: string } | null }
  | { kind: 'pending' }
  | { kind: 'syncing' }
  | { kind: 'error'; message: string }

export interface ScrapeResult {
  success: boolean
  count: number
  error?: string
}

export interface ScraperStatus {
  lastRun: string | null
  isRunning: boolean
}

export interface ImportResult {
  inserted: number
  updated: number
  skipped?: number
  errors?: { row: number; message: string; rawLine?: string }[]
  detectedHeaders?: string[]
}

export interface Credentials {
  username: string
  password: string
}

// ───── Member of the Month ─────

export type MotmNameStyle = 'vertical' | 'diagonal' | 'horizontal'

export interface MotmQA {
  question: string
  answer: string
}

export interface MotmMember {
  id: string
  name: string
  title?: string
  startDate?: string
  photo_url?: string
  nameStyle: MotmNameStyle
  isActive: boolean
  activeMonth?: string
  qa: MotmQA[]
  createdAt: string
  updatedAt: string
}

export interface OverlayParams {
  photoPath: string
  firstName: string
  lastName: string
  nameStyle: MotmNameStyle
  outputPath: string
}

export interface ParsedDocxResult {
  pairs: MotmQA[]
  rawText: string
  confidence: 'high' | 'medium' | 'low'
}

// ───── Coaches ─────

export interface Coach {
  id: string
  name: string
  sortOrder: number
  createdAt: string
}

// ───── Attendance ─────

export interface AttendanceRow {
  id: string
  firstName: string
  lastName: string
  count: number
  month: string
  createdAt: string
  updatedAt: string
}

// ───── QR Codes ─────

export interface QRCodeEntry {
  id: string
  icon: string
  label: string
  url: string
  includeInSlideshow: boolean
}
