// Minimal CSV parser. Quoted fields supported; embedded commas and escaped double
// quotes ("") handled. No dependency on papaparse for footprint.

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
  /** 1-based row number in the source file (header = row 1). */
  row: number
  /** Human-readable explanation of why this row was rejected. */
  message: string
  /** Original raw line, truncated to 120 chars for display. */
  rawLine?: string
}

export interface CsvParseResult {
  rows: ParsedCsvRow[]
  errors: CsvParseError[]
  /** The normalized headers we detected in the file (post-trim, lowercase). */
  detectedHeaders: string[]
}

const VALID_TYPES: EventType[] = ['birthday', 'anniversary', 'event', 'custom']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const BOOL_TRUE = new Set(['true', '1', 'yes', 'y', 't'])
const BOOL_FALSE = new Set(['false', '0', 'no', 'n', 'f'])

/** Scan the first N non-blank lines when looking for the header row. Handles
 *  Numbers/Excel exports that prepend "Table 1" or blank separator rows. */
const MAX_PREAMBLE = 5

// Header aliases — common variants we accept for each canonical column.
const HEADER_ALIASES: Record<keyof ParsedCsvRow, string[]> = {
  name: ['name', 'fullname', 'full_name', 'person', 'member', 'membername'],
  type: ['type', 'eventtype', 'event_type', 'category'],
  date: ['date', 'birthday', 'birthdate', 'birth_date', 'anniversary', 'eventdate', 'event_date'],
  recurring: ['recurring', 'recurs', 'repeat', 'annual'],
  notes: ['notes', 'note', 'comments', 'comment', 'description'],
  photo_url: ['photo_url', 'photo', 'photourl', 'image', 'image_url', 'imageurl', 'avatar']
}

function splitLine(line: string): string[] {
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
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Normalize a header cell: strip BOM, trim, strip non-breaking spaces, collapse
 *  runs of whitespace/underscores/hyphens/pluses, lowercase. */
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

/** Case-insensitive type matching; unknown values fall through to 'custom'. */
function parseType(raw: string | undefined): EventType {
  const v = (raw ?? '').trim().toLowerCase()
  return (VALID_TYPES as string[]).includes(v) ? (v as EventType) : 'custom'
}

/** Resolve canonical column name → the column index (or -1). */
function findColumn(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(headers[i] ?? '')) return i
  }
  return -1
}

function truncate(s: string, max = 120): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export function parseCsv(csv: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [], detectedHeaders: [] }
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/)

  if (lines.length === 0 || (lines.length === 1 && !lines[0]!.trim())) {
    result.errors.push({ row: 1, message: 'File is empty.' })
    return result
  }

  // Scan up to MAX_PREAMBLE non-blank lines for one that actually has both
  // a `name` and `date` column. Handles Numbers/Excel exports that prepend
  // a "Table 1" title row or blank separator rows.
  let headerRowIdx = -1
  let headers: string[] = []
  let nameIdx = -1
  let typeIdx = -1
  let dateIdx = -1
  let recurringIdx = -1
  let notesIdx = -1
  let photoIdx = -1
  let firstNonBlankIdx = -1
  let firstNonBlankHeaders: string[] = []
  let scanned = 0

  for (let i = 0; i < lines.length && scanned < MAX_PREAMBLE; i++) {
    if (!lines[i]!.trim()) continue
    scanned++
    const cand = splitLine(lines[i]!).map(normalizeHeader)
    if (firstNonBlankIdx === -1) {
      firstNonBlankIdx = i
      firstNonBlankHeaders = cand
    }
    const candName = findColumn(cand, HEADER_ALIASES.name)
    const candDate = findColumn(cand, HEADER_ALIASES.date)
    if (candName !== -1 && candDate !== -1) {
      headerRowIdx = i
      headers = cand
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

    // Detect attendance-shaped files (firstname + lastname + count column) and
    // redirect the user to the right import path rather than generic error.
    const hasFirst = firstNonBlankHeaders.some((h) =>
      ['firstname', 'first'].includes(h)
    )
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
        `Required columns: name, date. ` +
        `Detected headers on line ${firstNonBlankIdx + 1}: [${firstNonBlankHeaders.join(', ') || '(none)'}]. ` +
        `Accepted aliases — name: ${HEADER_ALIASES.name.join('/')}; date: ${HEADER_ALIASES.date.join('/')}. ` +
        `If this file came from Numbers or Excel, delete any title/summary rows above the column headers.`,
      rawLine: truncate(lines[firstNonBlankIdx]!)
    })
    return result
  }

  result.detectedHeaders = headers

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!
    if (!raw.trim()) continue
    // Trim whitespace (incl. non-breaking spaces) from every cell before validation.
    const cols = splitLine(raw).map((c) => c.replace(/\u00A0/g, ' ').trim())

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
    if (!DATE_RE.test(date)) {
      result.errors.push({
        row: i + 1,
        message: `Date "${date}" must be YYYY-MM-DD (e.g. 1990-03-15).`,
        rawLine: truncate(raw)
      })
      continue
    }

    result.rows.push({
      name,
      type: parseType(typeIdx === -1 ? undefined : cols[typeIdx]),
      date,
      recurring: parseBool(recurringIdx === -1 ? undefined : cols[recurringIdx], true),
      notes: notesIdx === -1 ? undefined : cols[notesIdx] || undefined,
      photo_url: photoIdx === -1 ? undefined : cols[photoIdx] || undefined
    })
  }
  return result
}
