// CSV / TSV parser for CelebrateDesk events.
//
// Supports two import shapes:
//   1. Standard format — `name, type, date, recurring, notes, photo_url`
//      (one event per row; canonical CelebrateDesk schema).
//   2. ChalkItPro members export — `First Name, Last Name, Birth Date,
//      Days Until Birthday, Member Since, Days Until Anniversary`
//      (one member per row → produces TWO events per row: a birthday + an
//      anniversary). Dates come in `MM/DD/YY` form and get pivoted to
//      20YY when YY < 30, else 19YY.
// Tab or comma separators are auto-detected.

import type { EventType } from '@shared/types'

export interface ParsedCsvRow {
  name: string
  type: EventType
  date: string
  recurring: boolean
  notes?: string
  photo_url?: string
}

export interface CsvParseError {
  row: number
  message: string
  rawLine?: string
}

export interface CsvParseResult {
  rows: ParsedCsvRow[]
  errors: CsvParseError[]
  detectedHeaders: string[]
}

const VALID_TYPES: EventType[] = ['birthday', 'anniversary', 'event', 'custom']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SHORT_DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/
const BOOL_TRUE = new Set(['true', '1', 'yes', 'y', 't'])
const BOOL_FALSE = new Set(['false', '0', 'no', 'n', 'f'])

const MAX_PREAMBLE = 5

// Canonical-format aliases.
const HEADER_ALIASES: Record<keyof ParsedCsvRow, string[]> = {
  name: ['name', 'fullname', 'full_name', 'person', 'member', 'membername'],
  type: ['type', 'eventtype', 'event_type', 'category'],
  date: ['date', 'birthday', 'birthdate', 'birth_date', 'anniversary', 'eventdate', 'event_date'],
  recurring: ['recurring', 'recurs', 'repeat', 'annual'],
  notes: ['notes', 'note', 'comments', 'comment', 'description'],
  photo_url: ['photo_url', 'photo', 'photourl', 'image', 'image_url', 'imageurl', 'avatar']
}

// ChalkItPro members-export aliases.
const CHALKIT_ALIASES = {
  firstName: ['firstname', 'first'],
  lastName: ['lastname', 'last'],
  birthDate: ['birthdate', 'birthday', 'dob'],
  memberSince: ['membersince', 'memberstart', 'joindate', 'startdate', 'anniversary']
}

function detectSeparator(line: string): string {
  // Count outside of quoted regions to avoid being tricked by commas inside quotes.
  let tabs = 0
  let commas = 0
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === '\t') tabs++
    else if (!inQuotes && ch === ',') commas++
  }
  // Prefer tabs when present and roughly comparable; ChalkItPro exports
  // as TSV despite the .csv extension.
  if (tabs >= 2 && tabs >= commas * 0.8) return '\t'
  return ','
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === sep) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
  }
  out.push(cur)
  return out
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-+]+/g, '')
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  const v = raw.trim().toLowerCase()
  if (v === '') return fallback
  if (BOOL_TRUE.has(v)) return true
  if (BOOL_FALSE.has(v)) return false
  return fallback
}

function parseType(raw: string | undefined): EventType {
  const v = (raw ?? '').trim().toLowerCase()
  return (VALID_TYPES as string[]).includes(v) ? (v as EventType) : 'custom'
}

function findColumn(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(headers[i] ?? '')) return i
  }
  return -1
}

function truncate(s: string, max = 120): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/** MM/DD/YY or MM/DD/YYYY → YYYY-MM-DD. Returns null if input isn't a
 *  valid slash-delimited date. Two-digit years pivot at 30: 00-29 → 20YY,
 *  30-99 → 19YY (birthdays > ~25 years ago assumed). */
export function parseShortDate(input: string): string | null {
  const m = input.match(SHORT_DATE_RE)
  if (!m) return null
  const month = parseInt(m[1]!, 10)
  const day = parseInt(m[2]!, 10)
  let year = parseInt(m[3]!, 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (m[3]!.length === 2) year = year < 30 ? 2000 + year : 1900 + year
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day
  ).padStart(2, '0')}`
}

/** Normalize any incoming date to YYYY-MM-DD, supporting both canonical
 *  YYYY-MM-DD and slash-delimited MM/DD/YY variants. */
function toCanonicalDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (DATE_RE.test(trimmed)) return trimmed
  return parseShortDate(trimmed)
}

function isChalkitMembersFormat(headers: string[]): boolean {
  const hasFirst = findColumn(headers, CHALKIT_ALIASES.firstName) !== -1
  const hasLast = findColumn(headers, CHALKIT_ALIASES.lastName) !== -1
  const hasBirth = findColumn(headers, CHALKIT_ALIASES.birthDate) !== -1
  const hasMember = findColumn(headers, CHALKIT_ALIASES.memberSince) !== -1
  // Must have names + at least one of the two dates.
  return hasFirst && hasLast && (hasBirth || hasMember)
}

function parseChalkitMembers(
  lines: string[],
  headers: string[],
  headerRowIdx: number,
  sep: string,
  result: CsvParseResult
): void {
  const firstIdx = findColumn(headers, CHALKIT_ALIASES.firstName)
  const lastIdx = findColumn(headers, CHALKIT_ALIASES.lastName)
  const birthIdx = findColumn(headers, CHALKIT_ALIASES.birthDate)
  const memberIdx = findColumn(headers, CHALKIT_ALIASES.memberSince)

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!
    if (!raw.trim()) continue
    const cols = splitLine(raw, sep).map((c) => c.replace(/\u00A0/g, ' ').trim())

    const first = cols[firstIdx] ?? ''
    const last = cols[lastIdx] ?? ''
    const name = `${first} ${last}`.trim()
    if (!name) {
      result.errors.push({
        row: i + 1,
        message: 'Missing first/last name.',
        rawLine: truncate(raw)
      })
      continue
    }

    let pushed = 0

    if (birthIdx !== -1) {
      const rawBirth = cols[birthIdx] ?? ''
      if (rawBirth) {
        const bday = toCanonicalDate(rawBirth)
        if (bday) {
          result.rows.push({
            name,
            type: 'birthday',
            date: bday,
            recurring: true
          })
          pushed++
        } else {
          result.errors.push({
            row: i + 1,
            message: `Birth Date "${rawBirth}" isn't parseable (expected MM/DD/YY or YYYY-MM-DD).`,
            rawLine: truncate(raw)
          })
        }
      }
    }

    if (memberIdx !== -1) {
      const rawMember = cols[memberIdx] ?? ''
      if (rawMember) {
        const anni = toCanonicalDate(rawMember)
        if (anni) {
          result.rows.push({
            name,
            type: 'anniversary',
            date: anni,
            recurring: true
          })
          pushed++
        } else {
          result.errors.push({
            row: i + 1,
            message: `Member Since "${rawMember}" isn't parseable (expected MM/DD/YY or YYYY-MM-DD).`,
            rawLine: truncate(raw)
          })
        }
      }
    }

    if (pushed === 0) {
      result.errors.push({
        row: i + 1,
        message: `No birthday or anniversary date on this row — nothing to import for "${name}".`,
        rawLine: truncate(raw)
      })
    }
  }
}

export function parseCsv(csv: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [], detectedHeaders: [] }
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/)

  if (lines.length === 0 || (lines.length === 1 && !lines[0]!.trim())) {
    result.errors.push({ row: 1, message: 'File is empty.' })
    return result
  }

  // Find the header row within the first MAX_PREAMBLE non-blank lines,
  // skipping Numbers/Excel "Table 1" preamble noise.
  let headerRowIdx = -1
  let headers: string[] = []
  let sep = ','
  let nameIdx = -1
  let typeIdx = -1
  let dateIdx = -1
  let recurringIdx = -1
  let notesIdx = -1
  let photoIdx = -1
  let chalkitDetected = false
  let firstNonBlankIdx = -1
  let firstNonBlankHeaders: string[] = []
  let scanned = 0

  for (let i = 0; i < lines.length && scanned < MAX_PREAMBLE; i++) {
    if (!lines[i]!.trim()) continue
    scanned++
    const candSep = detectSeparator(lines[i]!)
    const cand = splitLine(lines[i]!, candSep).map(normalizeHeader)
    if (firstNonBlankIdx === -1) {
      firstNonBlankIdx = i
      firstNonBlankHeaders = cand
    }

    // Try ChalkItPro members format first — more specific.
    if (isChalkitMembersFormat(cand)) {
      headerRowIdx = i
      headers = cand
      sep = candSep
      chalkitDetected = true
      break
    }

    // Standard events format.
    const candName = findColumn(cand, HEADER_ALIASES.name)
    const candDate = findColumn(cand, HEADER_ALIASES.date)
    if (candName !== -1 && candDate !== -1) {
      headerRowIdx = i
      headers = cand
      sep = candSep
      nameIdx = candName
      dateIdx = candDate
      typeIdx = findColumn(cand, HEADER_ALIASES.type)
      recurringIdx = findColumn(cand, HEADER_ALIASES.recurring)
      notesIdx = findColumn(cand, HEADER_ALIASES.notes)
      photoIdx = findColumn(cand, HEADER_ALIASES.photo_url)
      break
    }
  }

  if (headerRowIdx === -1) {
    if (firstNonBlankIdx === -1) {
      result.errors.push({ row: 1, message: 'File is empty.' })
      return result
    }
    result.detectedHeaders = firstNonBlankHeaders

    // Detect attendance-shaped files and redirect.
    const hasFirst = firstNonBlankHeaders.some((h) => ['firstname', 'first'].includes(h))
    const hasLast = firstNonBlankHeaders.some((h) => ['lastname', 'last'].includes(h))
    const hasCount = firstNonBlankHeaders.some((h) =>
      [
        'reservedcheckedin',
        'reservedcheckin',
        'checkedin',
        'checkins',
        'count',
        'classes',
        'classescompleted',
        'attended'
      ].includes(h)
    )
    if (hasFirst && hasLast && hasCount) {
      result.errors.push({
        row: firstNonBlankIdx + 1,
        message:
          `This looks like an ATTENDANCE export (First Name / Last Name / Reserved+Checked-In), ` +
          `not an events CSV. Use **Settings → Attendance → Import Attendance CSV…** instead. ` +
          `The button you just clicked is for birthdays & anniversaries.`,
        rawLine: truncate(lines[firstNonBlankIdx]!)
      })
      return result
    }

    result.errors.push({
      row: firstNonBlankIdx + 1,
      message:
        `No header row found in the first ${MAX_PREAMBLE} non-blank lines. ` +
        `Expected either CelebrateDesk standard (name, date) or ChalkItPro members export (First Name, Last Name, Birth Date, Member Since). ` +
        `Detected headers on line ${firstNonBlankIdx + 1}: [${firstNonBlankHeaders.join(', ') || '(none)'}]. ` +
        `If this file came from Numbers or Excel, delete any title/summary rows above the column headers.`,
      rawLine: truncate(lines[firstNonBlankIdx]!)
    })
    return result
  }

  result.detectedHeaders = headers

  if (chalkitDetected) {
    parseChalkitMembers(lines, headers, headerRowIdx, sep, result)
    return result
  }

  // Standard events format.
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!
    if (!raw.trim()) continue
    const cols = splitLine(raw, sep).map((c) => c.replace(/\u00A0/g, ' ').trim())

    const name = cols[nameIdx] ?? ''
    const date = cols[dateIdx] ?? ''

    if (!name) {
      result.errors.push({
        row: i + 1,
        message: 'Empty name (required).',
        rawLine: truncate(raw)
      })
      continue
    }
    if (!date) {
      result.errors.push({
        row: i + 1,
        message: 'Empty date (required, must be YYYY-MM-DD).',
        rawLine: truncate(raw)
      })
      continue
    }
    const canonical = toCanonicalDate(date)
    if (!canonical) {
      result.errors.push({
        row: i + 1,
        message: `Date "${date}" must be YYYY-MM-DD or MM/DD/YY (e.g. 1990-03-15 or 3/15/90).`,
        rawLine: truncate(raw)
      })
      continue
    }

    result.rows.push({
      name,
      type: parseType(typeIdx === -1 ? undefined : cols[typeIdx]),
      date: canonical,
      recurring: parseBool(recurringIdx === -1 ? undefined : cols[recurringIdx], true),
      notes: notesIdx === -1 ? undefined : cols[notesIdx] || undefined,
      photo_url: photoIdx === -1 ? undefined : cols[photoIdx] || undefined
    })
  }
  return result
}
