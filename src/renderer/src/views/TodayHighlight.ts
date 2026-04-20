import type { ViewContext } from './viewRegistry'
import { formatDisplayDate, sortByDaysUntil, todayInTz } from '@utils/dateHelpers'
import { celebrateIfNewDay } from '../components/ConfettiOverlay'
import { eventCard } from '../components/EventCard'
import { openEventForm } from '../modals/EventFormModal'

export function todayHighlight(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  const root = document.createElement('section')
  root.className = 'fade-in flex flex-col gap-6 p-6 md:p-10'

  const today = sortByDaysUntil(events).filter((e) => e.daysUntil === 0)
  const upcoming = sortByDaysUntil(events).filter((e) => e.daysUntil > 0 && e.daysUntil <= 14)
  // eslint-disable-next-line no-console
  console.log(
    '[today] events with daysUntil=0:',
    today.map((e) => e.name),
    ' | total events=',
    events.length
  )

  const header = document.createElement('div')
  header.className = 'text-center'
  const h1 = document.createElement('h1')
  h1.className = 'text-[32px] font-semibold leading-tight'
  h1.textContent = today.length > 0 ? "Today's Celebrations" : 'No celebrations today'
  const sub = document.createElement('p')
  sub.className = 'opacity-60 text-sm mt-1'
  sub.textContent = formatDisplayDate(todayInTz(timezone), timezone)
  header.appendChild(h1)
  header.appendChild(sub)
  root.appendChild(header)

  if (today.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[today] calling confetti (celebrateIfNewDay)')
    // Date-based key: fires once per calendar day per session.
    celebrateIfNewDay(`celebrate-${todayInTz(timezone)}`)
    const grid = document.createElement('div')
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto w-full'
    for (const ev of today) grid.appendChild(eventCard(ev, timezone))
    root.appendChild(grid)
  } else if (upcoming.length > 0) {
    const teaser = document.createElement('div')
    teaser.className = 'max-w-xl mx-auto w-full flex flex-col gap-3'
    const label = document.createElement('div')
    label.className = 'text-sm opacity-60 text-center'
    const first = upcoming[0]!
    label.textContent = `Next: ${first.name} — ${first.daysUntil === 1 ? 'tomorrow' : `in ${first.daysUntil} days`}`
    teaser.appendChild(label)
    teaser.appendChild(eventCard(first, timezone))
    root.appendChild(teaser)
  } else {
    const empty = document.createElement('div')
    empty.className = 'text-center opacity-60 py-12'
    empty.innerHTML = '<p>Your wall is quiet. Add someone to celebrate.</p>'
    const btn = document.createElement('button')
    btn.className = 'btn btn-primary mt-4'
    btn.textContent = 'Add event'
    btn.addEventListener('click', () => openEventForm(null))
    empty.appendChild(btn)
    root.appendChild(empty)
  }

  return root
}
