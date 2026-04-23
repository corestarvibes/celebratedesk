import type { CelebEventComputed } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { formatDisplayDate, sortByDaysUntil, todayInTz } from '@utils/dateHelpers'
import { celebrateIfNewDay } from '../components/ConfettiOverlay'
import { typeGlyph } from '../components/EventCard'
import { eventCard } from '../components/EventCard'
import { openEventForm } from '../modals/EventFormModal'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1] ?? '') : ''
  return `${(first[0] ?? '').toUpperCase()}${(second[0] ?? '').toUpperCase()}`
}

function hslForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 55%)`
}

/** Hero card for today's celebrants. Way bigger than the default eventCard. */
function todayHeroCard(ev: CelebEventComputed, timezone: string): HTMLElement {
  const card = document.createElement('button')
  card.className =
    'surface p-8 flex flex-col items-center gap-4 cursor-pointer hover:brightness-95 text-center min-w-0'
  card.addEventListener('click', () => openEventForm(ev))

  const avatar = document.createElement('div')
  avatar.className =
    'flex-shrink-0 rounded-brand w-32 h-32 flex items-center justify-center text-white font-black text-[56px]'
  if (ev.photo_url) {
    avatar.style.background = 'transparent'
    const img = document.createElement('img')
    img.src = ev.photo_url
    img.alt = ev.name
    img.className = 'w-32 h-32 rounded-brand object-cover'
    avatar.appendChild(img)
  } else {
    avatar.style.backgroundColor = hslForName(ev.name)
    avatar.textContent = initials(ev.name) || '?'
  }
  card.appendChild(avatar)

  const name = document.createElement('div')
  name.className = 'font-black leading-tight break-words w-full'
  name.style.fontSize = 'clamp(48px, 7vw, 88px)'
  name.textContent = ev.name
  card.appendChild(name)

  const badge = document.createElement('div')
  badge.className = 'type-badge'
  badge.style.fontSize = '22px'
  badge.style.padding = '6px 20px'
  badge.textContent = `${typeGlyph(ev.type)} ${ev.type}`
  card.appendChild(badge)

  let subtitleText = formatDisplayDate(ev.nextOccurrence, timezone)
  if (ev.type === 'birthday' && typeof ev.age === 'number') {
    subtitleText += ` · turning ${ev.age + 1}`
  } else if (ev.type === 'anniversary' && typeof ev.yearsCount === 'number') {
    subtitleText += ` · ${ev.yearsCount + 1} years`
  }
  const sub = document.createElement('div')
  sub.className = 'opacity-75'
  sub.style.fontSize = '26px'
  sub.textContent = subtitleText
  card.appendChild(sub)

  if (ev.notes) {
    const notes = document.createElement('div')
    notes.className = 'opacity-60 mt-1'
    notes.style.fontSize = '20px'
    notes.textContent = ev.notes
    card.appendChild(notes)
  }

  return card
}

export function todayHighlight(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  const root = document.createElement('section')
  // h-full + flex-col + justify-center eliminates the "lots of empty space below"
  root.className = 'fade-in h-full w-full flex flex-col justify-center gap-8 p-6 md:p-10'

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
  header.className = 'text-center flex-shrink-0'
  const h1 = document.createElement('h1')
  h1.className = 'font-black leading-tight'
  h1.style.fontSize = 'clamp(40px, 5vw, 72px)'
  h1.textContent = today.length > 0 ? "Today's Celebrations" : 'No celebrations today'
  const sub = document.createElement('p')
  sub.className = 'opacity-70 mt-2'
  sub.style.fontSize = '26px'
  sub.textContent = formatDisplayDate(todayInTz(timezone), timezone)
  header.appendChild(h1)
  header.appendChild(sub)
  root.appendChild(header)

  if (today.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[today] calling confetti (celebrateIfNewDay)')
    celebrateIfNewDay(`celebrate-${todayInTz(timezone)}`)

    const grid = document.createElement('div')
    // 1 card → big single column. 2 → side by side. 3+ → grid of 3.
    const cols = today.length === 1 ? 1 : today.length === 2 ? 2 : 3
    grid.className = 'grid gap-6 max-w-[1400px] mx-auto w-full'
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
    for (const ev of today) grid.appendChild(todayHeroCard(ev, timezone))
    root.appendChild(grid)
  } else if (upcoming.length > 0) {
    const teaser = document.createElement('div')
    teaser.className = 'max-w-2xl mx-auto w-full flex flex-col gap-4'
    const label = document.createElement('div')
    label.className = 'text-center opacity-70 font-semibold'
    label.style.fontSize = '24px'
    const first = upcoming[0]!
    label.textContent = `Next: ${first.daysUntil === 1 ? 'tomorrow' : `in ${first.daysUntil} days`}`
    teaser.appendChild(label)
    teaser.appendChild(eventCard(first, timezone))
    root.appendChild(teaser)
  } else {
    const empty = document.createElement('div')
    empty.className = 'text-center opacity-60 py-12 flex flex-col items-center gap-4'
    const msg = document.createElement('p')
    msg.className = 'text-[22px]'
    msg.textContent = 'Your wall is quiet. Add someone to celebrate.'
    empty.appendChild(msg)
    const btn = document.createElement('button')
    btn.className = 'btn btn-primary mt-2'
    btn.textContent = 'Add event'
    btn.addEventListener('click', () => openEventForm(null))
    empty.appendChild(btn)
    root.appendChild(empty)
  }

  return root
}
