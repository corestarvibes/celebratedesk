import type { ViewContext } from './viewRegistry'
import { formatDisplayDate, groupByDate, sortByDaysUntil } from '@utils/dateHelpers'
import { eventCard } from '../components/EventCard'

export function upcomingList(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  const root = document.createElement('section')
  root.className = 'fade-in p-6 md:p-8 max-w-3xl mx-auto w-full'

  const within = sortByDaysUntil(events.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 30))
  if (within.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'text-center opacity-60 py-16'
    empty.textContent = 'Nothing coming up in the next 30 days.'
    root.appendChild(empty)
    return root
  }

  const groups = groupByDate(within)
  const sortedKeys = [...groups.keys()].sort()

  for (const key of sortedKeys) {
    const arr = groups.get(key)!
    const heading = document.createElement('h3')
    heading.className = 'text-sm font-semibold opacity-70 uppercase tracking-wide mt-6 mb-2'
    const days = arr[0]!.daysUntil
    const label =
      days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatDisplayDate(key, timezone)
    heading.textContent = label
    root.appendChild(heading)

    const list = document.createElement('div')
    list.className = 'flex flex-col gap-3'
    for (const ev of arr) list.appendChild(eventCard(ev, timezone))
    root.appendChild(list)
  }
  return root
}
