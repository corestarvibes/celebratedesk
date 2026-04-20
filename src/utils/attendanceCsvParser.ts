// CSV parser tuned to ChalkItPro's attendance export.
// Handles: BOM, trailing spaces in cells, lowercase first-name capitalization,
// and the non-standard "Reserved + Checked-In" header name.

export interface AttendanceParsedRow {
  firstName: string
  lastName: string
  count: number
}

export interface AttendanceParseError {
  row: number
  message: string
  rawLine?: string
}

export interface AttendanceParseResult {
  rows: AttendanceParsedRow[]
  errors: AttendanceParseError[]
  detectedHeaders: string[]
}

const FIRST_NAME_ALIASES = ['firstname', 'first']
const LAST_NAME_ALIASES = ['lastname', 'last']
const COUNT_ALIASES = [
  'reservedcheckedin',
  'reservedcheckin',
  'checkedin',
  'checkins',
  'count',
  'classes',
  'classescompleted',
  'attended'
]

const MAX_PREAMBLE = 5

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
      } else cur += ch
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

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-+]+/g, '')
}

function findIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(headers[i] ?? '')) return i
  }
  return -1
}

/** Capitalize each whitespace-separated or hyphenated segment of a name.
 *  "kevin" → "Kevin"  ·  "mary-ann" → "Mary-Ann"  ·  "  sam  " → "Sam". */
export function capitalizeName(raw: string): string {
  return raw
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase())
}

function truncate(s: string, max = 120): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export function parseAttendanceCsv(csv: string): AttendanceParseResult {
  const result: AttendanceParseResult = { rows: [], errors: [], detectedHeaders: [] }
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines.length === 0 || (lines.length === 1 && !lines[0]!.trim())) {
    result.errors.push({ row: 1, message: 'File is empty.' })
    return result
  }

  let headerRowIdx = -1
  let headers: string[] = []
  let firstIdx = -1
  let lastIdx = -1
  let countIdx = -1
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
    const candFirst = findIndex(cand, FIRST_NAME_ALIASES)
    const candLast = findIndex(cand, LAST_NAME_ALIASES)
    const candCount = findIndex(cand, COUNT_ALIASES)
    if (candFirst !== -1 && candLast !== -1 && candCount !== -1) {
      headerRowIdx = i
      headers = cand
      firstIdx = candFirst
      lastIdx = candLast
      countIdx = candCount
      break
    }
  }

  if (headerRowIdx === -1) {
    result.detectedHeaders = firstNonBlankHeaders
    result.errors.push({
      row: firstNonBlankIdx + 1,
      message:
        `Could not find attendance headers. Required columns: First Name, Last Name, ` +
        `and a count column (e.g. "Reserved + Checked-In"). Detected: [${firstNonBlankHeaders.join(', ') || '(none)'}].`,
      rawLine: firstNonBlankIdx === -1 ? undefined : truncate(lines[firstNonBlankIdx]!)
    })
    return result
  }
  result.detectedHeaders = headers

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const raw = lines[i]!
    if (!raw.trim()) continue
    const cols = splitLine(raw).map((c) => c.replace(/\u00A0/g, ' ').trim())
    const firstRaw = cols[firstIdx] ?? ''
    const lastRaw = cols[lastIdx] ?? ''
    const countRaw = cols[countIdx] ?? ''

    const firstName = capitalizeName(firstRaw)
    const lastName = capitalizeName(lastRaw)

    if (!firstName || !lastName) {
      result.errors.push({
        row: i + 1,
        message: 'Missing first or last name.',
        rawLine: truncate(raw)
      })
      continue
    }

    const count = parseInt(countRaw.replace(/[^\d-]/g, ''), 10)
    if (!Number.isFinite(count)) {
      result.errors.push({
        row: i + 1,
        message: `Count "${countRaw}" is not a number.`,
        rawLine: truncate(raw)
      })
      continue
    }

    result.rows.push({ firstName, lastName, count })
  }

  return result
}
