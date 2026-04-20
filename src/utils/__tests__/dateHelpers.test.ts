import { describe, expect, it } from 'vitest'
import {
  formatDisplayDate,
  getAge,
  getDaysUntil,
  getNextOccurrence,
  groupByDate,
  handleFeb29,
  isSameMonth,
  isSameWeek,
  isToday,
  isWithinDays,
  sortByDaysUntil
} from '../dateHelpers'

// Fixed "now" anchor so all tests are deterministic: 2025-06-15 12:00 UTC.
const NOW = new Date('2025-06-15T12:00:00Z')
const TZ = 'America/New_York' // 2025-06-15 08:00 locally → date is still 2025-06-15

describe('handleFeb29', () => {
  it('keeps Feb 29 on leap years', () => {
    expect(handleFeb29('2000-02-29', 2024)).toBe('2024-02-29')
  })
  it('rolls Feb 29 to Feb 28 on non-leap years', () => {
    expect(handleFeb29('2000-02-29', 2025)).toBe('2025-02-28')
  })
  it('leaves non-Feb-29 dates alone, only changing the year', () => {
    expect(handleFeb29('1990-03-15', 2025)).toBe('2025-03-15')
  })
})

describe('getNextOccurrence', () => {
  it('returns same date for non-recurring events', () => {
    expect(getNextOccurrence('2030-01-01', false, TZ, NOW)).toBe('2030-01-01')
  })
  it('returns this year when the date is still in the future', () => {
    // July 4 is after June 15
    expect(getNextOccurrence('1990-07-04', true, TZ, NOW)).toBe('2025-07-04')
  })
  it('returns next year when the date has already passed this year', () => {
    // March 1 is before June 15
    expect(getNextOccurrence('1990-03-01', true, TZ, NOW)).toBe('2026-03-01')
  })
  it('returns today when the occurrence is today', () => {
    expect(getNextOccurrence('1990-06-15', true, TZ, NOW)).toBe('2025-06-15')
  })
  it('rolls Feb 29 to Feb 28 in a non-leap next year', () => {
    // "now" of 2025-06-15 → next occurrence is 2026-02-28 (2026 is non-leap)
    expect(getNextOccurrence('1992-02-29', true, TZ, NOW)).toBe('2026-02-28')
  })
  it('keeps Feb 29 in a leap next year', () => {
    // anchor late 2023 → next is 2024-02-29 (leap)
    const now2023 = new Date('2023-12-01T12:00:00Z')
    expect(getNextOccurrence('1992-02-29', true, TZ, now2023)).toBe('2024-02-29')
  })
})

describe('getDaysUntil', () => {
  it('returns 0 for today', () => {
    expect(getDaysUntil('2025-06-15', TZ, NOW)).toBe(0)
  })
  it('returns 1 for tomorrow', () => {
    expect(getDaysUntil('2025-06-16', TZ, NOW)).toBe(1)
  })
  it('returns negative for yesterday (non-recurring raw date)', () => {
    expect(getDaysUntil('2025-06-14', TZ, NOW)).toBe(-1)
  })
  it('returns the expected distance for a recurring event one day past', () => {
    // If the caller uses getNextOccurrence first, a yesterday recurring birthday
    // rolls to next year. Distance should be either 364 (leap) or 365.
    const next = getNextOccurrence('1990-06-14', true, TZ, NOW)
    const diff = getDaysUntil(next, TZ, NOW)
    expect([364, 365]).toContain(diff)
  })
})

describe('getAge', () => {
  it('returns the completed years before the birthday this year', () => {
    expect(getAge('1990-07-04', '2025-06-15')).toBe(34)
  })
  it('returns the completed years on the birthday', () => {
    expect(getAge('1990-06-15', '2025-06-15')).toBe(35)
  })
  it('returns the completed years after the birthday this year', () => {
    expect(getAge('1990-01-10', '2025-06-15')).toBe(35)
  })
  it('never returns negative', () => {
    expect(getAge('2030-01-01', '2025-06-15')).toBe(0)
  })
})

describe('isToday', () => {
  it('returns true for the same date', () => {
    expect(isToday('2025-06-15', TZ, NOW)).toBe(true)
  })
  it('returns false for a different date', () => {
    expect(isToday('2025-06-16', TZ, NOW)).toBe(false)
  })
})

describe('isSameWeek and isSameMonth', () => {
  // NOW = 2025-06-15 is a Sunday → Mon-Sun week spans 2025-06-09..2025-06-15.
  it('flags a date earlier in the same Mon-Sun week', () => {
    expect(isSameWeek('2025-06-11', TZ, NOW)).toBe(true)
  })
  it('does not flag a date in the following week', () => {
    expect(isSameWeek('2025-06-18', TZ, NOW)).toBe(false)
  })
  it('flags a date in the same month', () => {
    expect(isSameMonth('2025-06-30', TZ, NOW)).toBe(true)
  })
  it('does not flag a date in a different month', () => {
    expect(isSameMonth('2025-07-01', TZ, NOW)).toBe(false)
  })
})

describe('isWithinDays', () => {
  it('returns true for today', () => {
    expect(isWithinDays('2025-06-15', 7, TZ, NOW)).toBe(true)
  })
  it('returns true for 7 days out with limit 7', () => {
    expect(isWithinDays('2025-06-22', 7, TZ, NOW)).toBe(true)
  })
  it('returns false for 8 days out with limit 7', () => {
    expect(isWithinDays('2025-06-23', 7, TZ, NOW)).toBe(false)
  })
  it('returns false for past dates', () => {
    expect(isWithinDays('2025-06-14', 7, TZ, NOW)).toBe(false)
  })
})

describe('formatDisplayDate', () => {
  it('formats to weekday and month', () => {
    const out = formatDisplayDate('2025-06-15', TZ)
    expect(out).toMatch(/Sunday|Saturday|June|Jun/) // tolerant
  })
})

describe('sortByDaysUntil and groupByDate', () => {
  it('sorts ascending by daysUntil', () => {
    const out = sortByDaysUntil([{ daysUntil: 3 }, { daysUntil: 0 }, { daysUntil: 5 }])
    expect(out.map((e) => e.daysUntil)).toEqual([0, 3, 5])
  })
  it('groups events by nextOccurrence', () => {
    const g = groupByDate([
      { nextOccurrence: '2025-06-15' },
      { nextOccurrence: '2025-06-15' },
      { nextOccurrence: '2025-06-16' }
    ])
    expect(g.get('2025-06-15')).toHaveLength(2)
    expect(g.get('2025-06-16')).toHaveLength(1)
  })
})
