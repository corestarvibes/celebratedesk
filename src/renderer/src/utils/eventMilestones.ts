import type { CelebEventComputed } from '@shared/types'
import { getAge, getYearsCount, todayInTz } from '@utils/dateHelpers'

function milestoneValue(ev: CelebEventComputed, occurrenceDate: string): number | null {
  if (ev.type === 'birthday') return getAge(ev.date, occurrenceDate)
  if (ev.type === 'anniversary') return getYearsCount(ev.date, occurrenceDate)
  return null
}

export function milestoneShortLabel(
  ev: CelebEventComputed,
  occurrenceDate: string
): string {
  const value = milestoneValue(ev, occurrenceDate)
  if (value === null) return ''
  if (ev.type === 'anniversary') return `${value}y`
  return String(value)
}

export function milestoneVerboseLabel(
  ev: CelebEventComputed,
  occurrenceDate: string,
  timezone: string
): string {
  const value = milestoneValue(ev, occurrenceDate)
  if (value === null) return ''
  if (ev.type === 'anniversary') return `${value} years`
  return occurrenceDate < todayInTz(timezone) ? `turned ${value}` : `turning ${value}`
}
