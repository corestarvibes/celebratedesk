// Deterministic coach rotation. Pure functions — fully unit-testable.
//
// Coaches are sorted alphabetically by name (first token, then full string as
// tiebreaker). The picker for a given month is:
//
//   monthsSinceEpoch = (year - 2024) * 12 + (month - 1)
//   pickerIndex      = monthsSinceEpoch mod coaches.length
//
// This makes the rotation deterministic and stable across app restarts.

import type { Coach } from '@shared/types'

const EPOCH_YEAR = 2024

/** "YYYY-MM" → { year, month } (1-12). */
function parseMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return { year: y, month: m }
}

/** { year, month } → "YYYY-MM". */
function formatMonth(y: number, m: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
}

export function monthsSinceEpoch(ym: string): number {
  const { year, month } = parseMonth(ym)
  return (year - EPOCH_YEAR) * 12 + (month - 1)
}

function sortKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Sort coaches alphabetically: first name token, then whole name. */
export function sortCoaches(coaches: Coach[]): Coach[] {
  return [...coaches].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
}

/** Index into the sorted coach array for `referenceMonth`. -1 if no coaches. */
export function getCurrentPickerIndex(coaches: Coach[], referenceMonth: string): number {
  if (coaches.length === 0) return -1
  const n = coaches.length
  const raw = monthsSinceEpoch(referenceMonth) % n
  return ((raw % n) + n) % n // handle negative months
}

/** Which coach picks for the given "YYYY-MM"? Null if no coaches. */
export function getPickerForMonth(coaches: Coach[], month: string): Coach | null {
  if (coaches.length === 0) return null
  const sorted = sortCoaches(coaches)
  const idx = getCurrentPickerIndex(sorted, month)
  return sorted[idx] ?? null
}

/** Produce the rotation schedule for the next `months` months starting `from`. */
export function getRotationSchedule(
  coaches: Coach[],
  from: string,
  months: number
): { month: string; coach: Coach | null }[] {
  const { year, month } = parseMonth(from)
  const out: { month: string; coach: Coach | null }[] = []
  for (let i = 0; i < months; i++) {
    const mm0 = month - 1 + i // 0-indexed months from `from`
    const y = year + Math.floor(mm0 / 12)
    const m = (mm0 % 12) + 1
    const ym = formatMonth(y, m)
    out.push({ month: ym, coach: getPickerForMonth(coaches, ym) })
  }
  return out
}

/** Today's "YYYY-MM" in the given timezone (defaults to system tz). */
export function currentMonthInTz(tz?: string, now: Date = new Date()): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    timeZone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}

export function nextMonth(ym: string): string {
  const { year, month } = parseMonth(ym)
  const y = month === 12 ? year + 1 : year
  const m = month === 12 ? 1 : month + 1
  return formatMonth(y, m)
}

/** "YYYY-MM" → the PREVIOUS month, rolling back across year boundaries. */
export function previousMonth(ym: string): string {
  const { year, month } = parseMonth(ym)
  const y = month === 1 ? year - 1 : year
  const m = month === 1 ? 12 : month - 1
  return formatMonth(y, m)
}
