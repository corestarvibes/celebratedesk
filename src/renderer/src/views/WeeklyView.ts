import { addDays, parseISO } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import type { ViewContext } from './viewRegistry'
import { todayInTz } from '@utils/dateHelpers'
import { eventCardTight } from '../components/EventCard'

export function weeklyView(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  const root = document.createElement('section')
  root.className = 'fade-in p-3 md:p-4 h-full'

  const today = todayInTz(timezone)
  const dow = toZonedTime(parseISO(today), timezone).getDay() // 0 Sun..6 Sat
  const mondayOffset = (dow + 6) % 7
  const monday = addDays(parseISO(today), -mondayOffset)
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const grid = document.createElement('div')
  // 7 columns that shrink to fit — minmax(0, 1fr) lets columns go smaller than
  // their content, so nothing overflows the viewport. Smaller gap too.
  grid.className = 'grid gap-2 h-full w-full min-w-0'
  grid.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))'

  for (const d of days) {
    const key = formatInTimeZone(d, timezone, 'yyyy-MM-dd')
    const col = document.createElement('div')
    col.className = 'surface p-2 flex flex-col gap-2 min-h-[220px] min-w-0 overflow-hidden'
    if (key === today) {
      col.style.outline = '2px solid var(--brand-primary)'
      col.style.outlineOffset = '-2px'
    }

    const head = document.createElement('div')
    head.className = 'flex items-baseline justify-between mb-1 px-1'
    const dayName = document.createElement('div')
    dayName.className = 'font-semibold text-sm'
    dayName.textContent = formatInTimeZone(d, timezone, 'EEE')
    const dayNum = document.createElement('div')
    dayNum.className = 'text-xs opacity-60'
    dayNum.textContent = formatInTimeZone(d, timezone, 'MMM d')
    head.appendChild(dayName)
    head.appendChild(dayNum)
    col.appendChild(head)

    const dayEvents = events.filter((e) => e.nextOccurrence === key)
    if (dayEvents.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'text-xs opacity-40 px-1'
      empty.textContent = '—'
      col.appendChild(empty)
    } else {
      const list = document.createElement('div')
      list.className = 'flex flex-col gap-2 min-w-0 overflow-hidden'
      for (const ev of dayEvents) list.appendChild(eventCardTight(ev))
      col.appendChild(list)
    }
    grid.appendChild(col)
  }

  root.appendChild(grid)
  return root
}
