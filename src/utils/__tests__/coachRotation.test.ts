import { describe, expect, it } from 'vitest'
import type { Coach } from '@shared/types'
import {
  currentMonthInTz,
  getCurrentPickerIndex,
  getPickerForMonth,
  getRotationSchedule,
  monthsSinceEpoch,
  nextMonth,
  sortCoaches
} from '../coachRotation'

const coach = (name: string, id = name.toLowerCase().replace(/\s+/g, '')): Coach => ({
  id,
  name,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z'
})

describe('coachRotation — monthsSinceEpoch', () => {
  it('returns 0 for January 2024', () => {
    expect(monthsSinceEpoch('2024-01')).toBe(0)
  })
  it('returns 27 for April 2026', () => {
    expect(monthsSinceEpoch('2026-04')).toBe(27)
  })
})

describe('coachRotation — sortCoaches', () => {
  it('sorts by first name, then full name alphabetically', () => {
    const coaches = [
      coach('Alex Saad'),
      coach('Adam'),
      coach('Alex Mayzak'),
      coach('J'),
      coach('Heather'),
      coach('Matt'),
      coach('Andy')
    ]
    const out = sortCoaches(coaches).map((c) => c.name)
    expect(out).toEqual(['Adam', 'Alex Mayzak', 'Alex Saad', 'Andy', 'Heather', 'J', 'Matt'])
  })
})

describe('coachRotation — picker selection', () => {
  const coaches = [coach('Adam'), coach('Beth'), coach('Chris')]

  it('returns a valid index for a non-empty list', () => {
    expect(getCurrentPickerIndex(sortCoaches(coaches), '2024-01')).toBe(0)
    expect(getCurrentPickerIndex(sortCoaches(coaches), '2024-02')).toBe(1)
    expect(getCurrentPickerIndex(sortCoaches(coaches), '2024-03')).toBe(2)
    expect(getCurrentPickerIndex(sortCoaches(coaches), '2024-04')).toBe(0)
  })

  it('returns -1 when list is empty', () => {
    expect(getCurrentPickerIndex([], '2026-04')).toBe(-1)
  })

  it('wraps correctly for later months', () => {
    // 27 % 3 = 0 → Adam
    expect(getPickerForMonth(coaches, '2026-04')?.name).toBe('Adam')
  })

  it('returns null for empty list', () => {
    expect(getPickerForMonth([], '2026-04')).toBeNull()
  })
})

describe('coachRotation — getRotationSchedule', () => {
  it('returns N months, each with the correct picker', () => {
    const coaches = [coach('Adam'), coach('Beth')]
    const schedule = getRotationSchedule(coaches, '2026-04', 4)
    expect(schedule.map((s) => s.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
    // 27%2=1 Beth, 28%2=0 Adam, 29%2=1 Beth, 30%2=0 Adam
    expect(schedule.map((s) => s.coach?.name)).toEqual(['Beth', 'Adam', 'Beth', 'Adam'])
  })

  it('rolls across year boundaries', () => {
    const coaches = [coach('A'), coach('B')]
    const schedule = getRotationSchedule(coaches, '2026-11', 3)
    expect(schedule.map((s) => s.month)).toEqual(['2026-11', '2026-12', '2027-01'])
  })
})

describe('coachRotation — currentMonthInTz + nextMonth', () => {
  it('returns YYYY-MM', () => {
    const r = currentMonthInTz('America/New_York', new Date('2026-04-19T12:00:00Z'))
    expect(r).toBe('2026-04')
  })

  it('rolls December into January', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
  })

  it('advances to next month', () => {
    expect(nextMonth('2026-04')).toBe('2026-05')
  })
})
