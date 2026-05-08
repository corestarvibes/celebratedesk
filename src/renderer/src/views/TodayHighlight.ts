import type { CelebEventComputed } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { formatDisplayDate, sortByDaysUntil, todayInTz } from '@utils/dateHelpers'
import { celebrateIfNewDay } from '../components/ConfettiOverlay'
import { typeGlyph } from '../components/EventCard'
import { eventCard } from '../components/EventCard'
import { openEventForm } from '../modals/EventFormModal'
import { fitToViewport } from '../utils/fitToViewport'
import { milestoneVerboseLabel } from '../utils/eventMilestones'

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
    'surface flex flex-col items-center cursor-pointer hover:brightness-95 text-center min-w-0'
  card.style.padding = 'calc(32px * var(--fit-scale, 1))'
  card.style.gap = 'calc(16px * var(--fit-scale, 1))'
  card.addEventListener('click', () => openEventForm(ev))

  const avatar = document.createElement('div')
  avatar.className =
    'flex-shrink-0 rounded-brand flex items-center justify-center text-white font-black'
  avatar.style.width = 'calc(clamp(88px, 15vh, 150px) * var(--fit-scale, 1))'
  avatar.style.height = 'calc(clamp(88px, 15vh, 150px) * var(--fit-scale, 1))'
  avatar.style.fontSize = 'calc(clamp(38px, 6vh, 64px) * var(--fit-scale, 1))'
  if (ev.photo_url) {
    avatar.style.background = 'transparent'
    const img = document.createElement('img')
    img.src = ev.photo_url
    img.alt = ev.name
    img.className = 'w-full h-full rounded-brand object-cover'
    avatar.appendChild(img)
  } else {
    avatar.style.backgroundColor = hslForName(ev.name)
    avatar.textContent = initials(ev.name) || '?'
  }
  card.appendChild(avatar)

  const name = document.createElement('div')
  name.className = 'font-black leading-tight break-words w-full'
  name.style.fontSize = 'calc(clamp(42px, 5.2vw, 72px) * var(--fit-scale, 1))'
  name.textContent = ev.name
  card.appendChild(name)

  const badge = document.createElement('div')
  badge.className = 'type-badge'
  badge.style.fontSize = 'calc(22px * var(--fit-scale, 1))'
  badge.style.padding = 'calc(6px * var(--fit-scale, 1)) calc(20px * var(--fit-scale, 1))'
  badge.textContent = `${typeGlyph(ev.type)} ${ev.type}`
  card.appendChild(badge)

  let subtitleText = formatDisplayDate(ev.nextOccurrence, timezone)
  const milestone = milestoneVerboseLabel(ev, ev.nextOccurrence, timezone)
  if (milestone) subtitleText += ` · ${milestone}`
  const sub = document.createElement('div')
  sub.className = 'opacity-75'
  sub.style.fontSize = 'calc(26px * var(--fit-scale, 1))'
  sub.textContent = subtitleText
  card.appendChild(sub)

  if (ev.notes) {
    const notes = document.createElement('div')
    notes.className = 'opacity-60 mt-1'
    notes.style.fontSize = 'calc(20px * var(--fit-scale, 1))'
    notes.textContent = ev.notes
    card.appendChild(notes)
  }

  return card
}

export function todayHighlight(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  const root = document.createElement('section')
  // h-full + flex-col + justify-center eliminates the "lots of empty space below"
  root.className = 'fade-in h-full w-full flex flex-col p-6 md:p-10'

  const fitFrame = document.createElement('div')
  fitFrame.className = 'flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden'

  const content = document.createElement('div')
  content.className = 'w-full flex flex-col justify-center'
  content.style.gap = 'calc(32px * var(--fit-scale, 1))'

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
  h1.style.fontSize = 'calc(clamp(40px, 5vw, 72px) * var(--fit-scale, 1))'
  h1.textContent = today.length > 0 ? "Today's Celebrations" : 'No celebrations today'
  const sub = document.createElement('p')
  sub.className = 'opacity-70 mt-2'
  sub.style.fontSize = 'calc(26px * var(--fit-scale, 1))'
  sub.textContent = formatDisplayDate(todayInTz(timezone), timezone)
  header.appendChild(h1)
  header.appendChild(sub)
  content.appendChild(header)

  if (today.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[today] calling confetti (celebrateIfNewDay)')
    celebrateIfNewDay(`celebrate-${todayInTz(timezone)}`)

    const grid = document.createElement('div')
    // 1 card → big single column. 2 → side by side. 3+ → grid of 3.
    const cols = today.length === 1 ? 1 : today.length === 2 ? 2 : 3
    grid.className = 'grid gap-6 max-w-[1400px] mx-auto w-full'
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
    grid.style.gap = 'calc(24px * var(--fit-scale, 1))'
    for (const ev of today) grid.appendChild(todayHeroCard(ev, timezone))
    content.appendChild(grid)
  } else if (upcoming.length > 0) {
    const teaser = document.createElement('div')
    teaser.className = 'max-w-2xl mx-auto w-full flex flex-col gap-4'
    const label = document.createElement('div')
    label.className = 'text-center opacity-70 font-semibold'
    label.style.fontSize = 'calc(24px * var(--fit-scale, 1))'
    const first = upcoming[0]!
    label.textContent = `Next: ${first.daysUntil === 1 ? 'tomorrow' : `in ${first.daysUntil} days`}`
    teaser.appendChild(label)
    teaser.appendChild(eventCard(first, timezone))
    content.appendChild(teaser)
  } else {
    const empty = document.createElement('div')
    empty.className = 'text-center opacity-60 py-12 flex flex-col items-center gap-4'
    empty.style.paddingTop = 'calc(48px * var(--fit-scale, 1))'
    empty.style.paddingBottom = 'calc(48px * var(--fit-scale, 1))'
    empty.style.gap = 'calc(16px * var(--fit-scale, 1))'
    const msg = document.createElement('p')
    msg.style.fontSize = 'calc(22px * var(--fit-scale, 1))'
    msg.textContent = 'Your wall is quiet. Add someone to celebrate.'
    empty.appendChild(msg)
    const btn = document.createElement('button')
    btn.className = 'btn btn-primary mt-2'
    btn.textContent = 'Add event'
    btn.addEventListener('click', () => openEventForm(null))
    empty.appendChild(btn)
    content.appendChild(empty)
  }

  fitFrame.appendChild(content)
  root.appendChild(fitFrame)
  fitToViewport(fitFrame, content, { mode: 'css-var', minScale: 0.76 })

  return root
}
