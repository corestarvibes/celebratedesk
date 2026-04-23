import type { CelebEventComputed } from '@shared/types'
import { formatDisplayDate } from '@utils/dateHelpers'
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

function daysLabel(d: number): string {
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return `In ${d} days`
}

export function typeGlyph(type: CelebEventComputed['type']): string {
  switch (type) {
    case 'birthday':
      return '🎂'
    case 'anniversary':
      return '🎉'
    case 'event':
      return '⭐'
    default:
      return '🎯'
  }
}

/**
 * Tight vertical card used in narrow columns (week view grid).
 * No date text (the column header owns that), no redundant wrapping of the name.
 * Name wraps to up to 3 lines; "Today" pill sits BELOW the name row so it never
 * clashes.
 */
export function eventCardTight(ev: CelebEventComputed): HTMLElement {
  const card = document.createElement('div')
  card.className =
    'surface p-3 flex flex-col gap-2 cursor-pointer hover:brightness-95 overflow-hidden min-w-0'
  card.addEventListener('click', () => openEventForm(ev))

  const row = document.createElement('div')
  row.className = 'flex items-start gap-3 min-w-0'

  const avatar = document.createElement('div')
  avatar.className =
    'flex-shrink-0 rounded-brand w-10 h-10 flex items-center justify-center text-white font-semibold text-sm'
  if (ev.photo_url) {
    avatar.style.background = 'transparent'
    const img = document.createElement('img')
    img.src = ev.photo_url
    img.alt = ev.name
    img.className = 'w-10 h-10 rounded-brand object-cover'
    avatar.appendChild(img)
  } else {
    avatar.style.backgroundColor = hslForName(ev.name)
    avatar.textContent = initials(ev.name) || '?'
  }

  const body = document.createElement('div')
  body.className = 'flex-1 min-w-0 overflow-hidden'

  const name = document.createElement('div')
  // Bigger name for TV legibility. Still wraps (break-words) so no truncation.
  name.className = 'font-bold text-[26px] leading-tight break-words'
  name.textContent = `${typeGlyph(ev.type)} ${ev.name}`
  body.appendChild(name)

  if (ev.type === 'birthday' && typeof ev.age === 'number') {
    const sub = document.createElement('div')
    sub.className = 'text-[16px] opacity-70 mt-1'
    sub.textContent = `turning ${ev.age + 1}`
    body.appendChild(sub)
  } else if (ev.type === 'anniversary' && typeof ev.yearsCount === 'number') {
    const sub = document.createElement('div')
    sub.className = 'text-[16px] opacity-70 mt-1'
    sub.textContent = `${ev.yearsCount + 1} years`
    body.appendChild(sub)
  }

  row.appendChild(avatar)
  row.appendChild(body)
  card.appendChild(row)

  if (ev.daysUntil === 0) {
    const badge = document.createElement('div')
    badge.className = 'days-badge self-start text-[14px] px-3 py-0.5'
    badge.textContent = 'Today'
    card.appendChild(badge)
  }

  return card
}

export function eventCard(
  ev: CelebEventComputed,
  timezone: string,
  opts: { compact?: boolean; clickable?: boolean } = {}
): HTMLElement {
  const card = document.createElement('div')
  card.className = `surface p-5 flex gap-5 items-center ${opts.clickable === false ? '' : 'cursor-pointer hover:brightness-95'}`
  if (opts.clickable !== false) {
    card.addEventListener('click', () => openEventForm(ev))
  }

  const avatar = document.createElement('div')
  avatar.className =
    'flex-shrink-0 rounded-brand w-16 h-16 flex items-center justify-center text-white font-bold text-2xl'
  if (ev.photo_url) {
    avatar.style.background = 'transparent'
    const img = document.createElement('img')
    img.src = ev.photo_url
    img.alt = ev.name
    img.className = 'w-16 h-16 rounded-brand object-cover'
    avatar.appendChild(img)
  } else {
    avatar.style.backgroundColor = hslForName(ev.name)
    avatar.textContent = initials(ev.name) || '?'
  }

  const body = document.createElement('div')
  body.className = 'flex-1 min-w-0 overflow-hidden'

  const row1 = document.createElement('div')
  row1.className = 'flex items-center flex-wrap gap-x-3 gap-y-1'
  const name = document.createElement('div')
  // Allow wrapping instead of truncating — "Michelle" shouldn't become "Mi…".
  name.className = 'font-bold text-[28px] leading-tight break-words'
  name.textContent = ev.name
  const badge = document.createElement('span')
  badge.className = 'type-badge flex-shrink-0'
  badge.style.fontSize = '15px'
  badge.style.padding = '3px 12px'
  badge.textContent = `${typeGlyph(ev.type)} ${ev.type}`
  row1.appendChild(name)
  row1.appendChild(badge)

  const row2 = document.createElement('div')
  row2.className = 'text-[18px] opacity-70 mt-1'
  let subtitle = formatDisplayDate(ev.nextOccurrence, timezone)
  if (ev.type === 'birthday' && typeof ev.age === 'number') subtitle += ` · turning ${ev.age + 1}`
  if (ev.type === 'anniversary' && typeof ev.yearsCount === 'number')
    subtitle += ` · ${ev.yearsCount + 1} years`
  row2.textContent = subtitle

  body.appendChild(row1)
  body.appendChild(row2)
  if (!opts.compact && ev.notes) {
    const notes = document.createElement('div')
    notes.className = 'text-[16px] opacity-60 mt-1 truncate'
    notes.textContent = ev.notes
    body.appendChild(notes)
  }

  const days = document.createElement('div')
  days.className = 'days-badge flex-shrink-0'
  days.style.fontSize = '15px'
  days.style.padding = '4px 14px'
  days.textContent = daysLabel(ev.daysUntil)

  card.appendChild(avatar)
  card.appendChild(body)
  card.appendChild(days)
  return card
}
