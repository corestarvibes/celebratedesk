// All date math lives here. Pure functions only — fully unit-testable.
// Dates are YYYY-MM-DD strings with no time/tz component. Comparisons use the
// caller-supplied IANA timezone (typically the system tz detected at startup).

import { addDays, differenceInCalendarDays, isLeapYear, parseISO } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertDate(d: string): void {
  if (!DATE_RE.test(d)) {
    throw new Error(`Invalid date string "${d}" — expected YYYY-MM-DD`)
  }
}

/** Current date in the given timezone as YYYY-MM-DD. */
export function todayInTz(timezone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd')
}

/**
 * Feb 29 rule: when rolling a Feb-29 event into a non-leap year,
 * fall back to Feb 28 of that year. Leap years keep Feb 29.
 */
export function handleFeb29(date: string, targetYear: number): string {
  assertDate(date)
  const [, month, day] = date.split('-')
  if (month === '02' && day === '29') {
    const year = targetYear
    // date-fns isLeapYear takes a Date
    const leap = isLeapYear(new Date(year, 0, 1))
    return `${String(year).padStart(4, '0')}-02-${leap ? '29' : '28'}`
  }
  return `${String(targetYear).padStart(4, '0')}-${month}-${day}`
}

/**
 * Next occurrence of a date in the given timezone.
 * - If `recurring` is false, returns the original date unchanged.
 * - If `recurring` is true and the month/day has already passed this year, returns next year.
 * - Today counts as "next" (not rolled forward).
 */
export function getNextOccurrence(date: string, recurring: boolean, timezone: string, now: Date = new Date()): string {
  assertDate(date)
  if (!recurring) return date

  const today = todayInTz(timezone, now)
  const [tyStr] = today.split('-')
  const thisYear = Number(tyStr)

  const thisYearOccurrence = handleFeb29(date, thisYear)
  if (thisYearOccurrence >= today) return thisYearOccurrence
  return handleFeb29(date, thisYear + 1)
}

/** Days between today (in tz) and target date. 0 = today, 1 = tomorrow, negative = past. */
export function getDaysUntil(targetDate: string, timezone: string, now: Date = new Date()): number {
  assertDate(targetDate)
  const today = todayInTz(timezone, now)
  // Parse as floating (no tz) so the diff is pure calendar-day.
  return differenceInCalendarDays(parseISO(targetDate), parseISO(today))
}

/** Completed years between birthDate and asOf (both YYYY-MM-DD). */
export function getAge(birthDate: string, asOf: string): number {
  assertDate(birthDate)
  assertDate(asOf)
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [ay, am, ad] = asOf.split('-').map(Number) as [number, number, number]
  let age = ay - by
  if (am < bm || (am === bm && ad < bd)) age -= 1
  return Math.max(0, age)
}

/** Years since startDate at asOf (useful for anniversaries). */
export function getYearsCount(startDate: string, asOf: string): number {
  return getAge(startDate, asOf)
}

export function isToday(date: string, timezone: string, now: Date = new Date()): boolean {
  assertDate(date)
  return date === todayInTz(timezone, now)
}

/** Within the current calendar week (Mon..Sun) of the given tz. */
export function isSameWeek(date: string, timezone: string, now: Date = new Date()): boolean {
  assertDate(date)
  const today = todayInTz(timezone, now)
  const dowToday = toZonedTime(parseISO(today), timezone).getDay() // 0 Sun..6 Sat
  const mondayOffset = (dowToday + 6) % 7 // distance back to Monday
  const monday = addDays(parseISO(today), -mondayOffset)
  const sunday = addDays(monday, 6)
  const target = parseISO(date)
  return target >= monday && target <= sunday
}

export function isSameMonth(date: string, timezone: string, now: Date = new Date()): boolean {
  assertDate(date)
  const today = todayInTz(timezone, now)
  return date.slice(0, 7) === today.slice(0, 7)
}

/** Target date falls within the next `days` days (inclusive of today). */
export function isWithinDays(date: string, days: number, timezone: string, now: Date = new Date()): boolean {
  const delta = getDaysUntil(date, timezone, now)
  return delta >= 0 && delta <= days
}

/** Pretty display: "Monday, June 3". */
export function formatDisplayDate(date: string, timezone: string): string {
  assertDate(date)
  return formatInTimeZone(parseISO(date), timezone, 'EEEE, MMMM d')
}

export interface HasDaysUntil {
  daysUntil: number
}

export function sortByDaysUntil<T extends HasDaysUntil>(events: T[]): T[] {
  return [...events].sort((a, b) => a.daysUntil - b.daysUntil)
}

export interface HasNextOccurrence {
  nextOccurrence: string
}

export function groupByDate<T extends HasNextOccurrence>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const ev of events) {
    const arr = map.get(ev.nextOccurrence) ?? []
    arr.push(ev)
    map.set(ev.nextOccurrence, arr)
  }
  return map
}
