import { addMonths, endOfMonth, parseISO, startOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import type { CelebEventComputed } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { todayInTz } from '@utils/dateHelpers'
import { eventCard, typeGlyph } from '../components/EventCard'

let monthCursor: Date = new Date()

const MAX_PILLS = 2

export function monthlyCalendar(ctx: ViewContext): HTMLElement {
  const { events, timezone } = ctx
  const root = document.createElement('section')
  root.className = 'fade-in p-6 md:p-8 flex flex-col gap-4 h-full'

  const todayKey = todayInTz(timezone)

  const first = startOfMonth(monthCursor)
  const last = endOfMonth(monthCursor)
  const firstDow = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - firstDow)
  const days: string[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(formatInTimeZone(d, timezone, 'yyyy-MM-dd'))
    if (days.length >= 35 && d > last) break
  }

  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const title = document.createElement('h2')
  title.className = 'text-[24px] font-semibold'
  title.textContent = formatInTimeZone(monthCursor, timezone, 'MMMM yyyy')

  const nav = document.createElement('div')
  nav.className = 'flex gap-1'
  const prev = document.createElement('button')
  prev.className = 'icon-btn'
  prev.textContent = '‹'
  prev.addEventListener('click', () => {
    monthCursor = addMonths(monthCursor, -1)
    root.replaceWith(monthlyCalendar(ctx))
  })
  const today = document.createElement('button')
  today.className = 'btn btn-ghost'
  today.textContent = 'Today'
  today.addEventListener('click', () => {
    monthCursor = new Date()
    root.replaceWith(monthlyCalendar(ctx))
  })
  const next = document.createElement('button')
  next.className = 'icon-btn'
  next.textContent = '›'
  next.addEventListener('click', () => {
    monthCursor = addMonths(monthCursor, 1)
    root.replaceWith(monthlyCalendar(ctx))
  })
  nav.appendChild(prev)
  nav.appendChild(today)
  nav.appendChild(next)

  header.appendChild(title)
  header.appendChild(nav)
  root.appendChild(header)

  const dowRow = document.createElement('div')
  dowRow.className = 'grid grid-cols-7 gap-2 text-xs opacity-60 text-center'
  for (const l of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    const d = document.createElement('div')
    d.textContent = l
    dowRow.appendChild(d)
  }
  root.appendChild(dowRow)

  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-7 gap-2 flex-1 min-h-0'

  const monthStr = formatInTimeZone(monthCursor, timezone, 'yyyy-MM')

  for (const key of days) {
    const cell = document.createElement('button')
    cell.className =
      'surface p-1.5 min-h-[92px] text-left relative flex flex-col gap-1 overflow-hidden'
    const isCurrentMonth = key.startsWith(monthStr)
    if (!isCurrentMonth) cell.style.opacity = '0.35'
    if (key === todayKey) {
      cell.style.outline = '2px solid var(--brand-primary)'
      cell.style.outlineOffset = '-2px'
    }

    const dayNum = document.createElement('div')
    const dayOnly = parseISO(key).getDate()
    dayNum.className = 'font-semibold text-sm leading-none px-1 pt-0.5'
    dayNum.textContent = String(dayOnly)
    cell.appendChild(dayNum)

    const dayEvents = events.filter((e) => e.nextOccurrence === key)
    if (dayEvents.length > 0) {
      const pills = document.createElement('div')
      pills.className = 'flex flex-col gap-0.5 min-w-0 overflow-hidden'
      const shown = dayEvents.slice(0, MAX_PILLS)
      for (const ev of shown) {
        const pill = document.createElement('div')
        pill.className =
          'text-[11px] leading-tight px-1.5 py-0.5 rounded-full truncate min-w-0 font-semibold'
        // Solid amber bg + white text — works in both light and dark mode.
        pill.style.backgroundColor = 'rgb(245, 158, 11)'
        pill.style.color = '#ffffff'
        pill.textContent = `${typeGlyph(ev.type)} ${ev.name}`
        pill.title = `${ev.name} — ${ev.type}`
        pills.appendChild(pill)
      }
      if (dayEvents.length > MAX_PILLS) {
        const more = document.createElement('div')
        // Readable "+N more" in both modes via slate-600 (light) / slate-400 (dark).
        more.className =
          'text-[11px] leading-tight px-1.5 font-medium text-slate-600 dark:text-slate-400'
        more.textContent = `+${dayEvents.length - MAX_PILLS} more`
        pills.appendChild(more)
      }
      cell.appendChild(pills)

      cell.addEventListener('click', () => showDayPopover(cell, dayEvents, timezone))
    }
    grid.appendChild(cell)
  }
  root.appendChild(grid)
  return root
}

function showDayPopover(
  anchor: HTMLElement,
  evs: CelebEventComputed[],
  tz: string
): void {
  document.querySelectorAll('.day-popover').forEach((n) => n.remove())
  const pop = document.createElement('div')
  pop.className = 'day-popover surface p-3 z-30 shadow-card max-w-xs flex flex-col gap-2'
  pop.style.minWidth = '260px'
  const rect = anchor.getBoundingClientRect()
  pop.style.position = 'fixed'
  pop.style.top = `${rect.bottom + 4}px`
  pop.style.left = `${rect.left}px`
  for (const ev of evs) {
    pop.appendChild(eventCard(ev, tz, { compact: true }))
  }
  const close = document.createElement('button')
  close.className = 'text-xs opacity-60 mt-1 self-end'
  close.textContent = 'Close'
  close.addEventListener('click', () => pop.remove())
  pop.appendChild(close)
  document.body.appendChild(pop)
  const off = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node)) {
      pop.remove()
      document.removeEventListener('click', off, true)
    }
  }
  setTimeout(() => document.addEventListener('click', off, true), 0)
}
