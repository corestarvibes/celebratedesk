import type { ViewContext } from './viewRegistry'
import { sortByDaysUntil } from '@utils/dateHelpers'
import { eventCard } from '../components/EventCard'

export function peopleGallery(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  // eslint-disable-next-line no-console
  console.log(
    '[people] render — total events=',
    events.length,
    ' first 5 names=',
    events.slice(0, 5).map((e) => e.name)
  )
  const root = document.createElement('section')
  root.className = 'fade-in p-4 md:p-6'

  if (events.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'text-center opacity-60 py-16'
    empty.textContent = 'No people yet. Add someone or import a CSV.'
    root.appendChild(empty)
    return root
  }

  const sorted = sortByDaysUntil(events)
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
  for (const ev of sorted) grid.appendChild(eventCard(ev, timezone))
  root.appendChild(grid)
  return root
}
