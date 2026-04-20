import type { AttendanceRow } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { currentMonthInTz } from '@utils/coachRotation'

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function fontSizeFor(n: number): string {
  if (n <= 10) return '18px'
  if (n <= 16) return '16px'
  if (n <= 22) return '14px'
  if (n <= 32) return '12px'
  return '11px'
}

/** If the list is taller than its container, slowly auto-scroll in a loop so
 *  display-wall viewers never have to touch anything. Pauses at top + bottom. */
function startAutoScroll(list: HTMLElement): void {
  // Defer so layout is measured after append.
  requestAnimationFrame(() => {
    const overflow = list.scrollHeight - list.clientHeight
    if (overflow <= 4) return // fits, no scroll needed
    let dir = 1 // 1 = down, -1 = up
    let offset = 0
    let holdUntil = performance.now() + 2000 // pause 2s at start
    const PX_PER_FRAME = 0.35
    const HOLD_MS = 2500
    const step = (now: number): void => {
      if (!list.isConnected) return
      if (now < holdUntil) {
        requestAnimationFrame(step)
        return
      }
      offset += PX_PER_FRAME * dir
      if (offset >= overflow) {
        offset = overflow
        dir = -1
        holdUntil = now + HOLD_MS
      } else if (offset <= 0) {
        offset = 0
        dir = 1
        holdUntil = now + HOLD_MS
      }
      list.scrollTop = offset
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

function sortRows(rows: AttendanceRow[]): AttendanceRow[] {
  return [...rows].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const an = `${a.firstName} ${a.lastName}`.toLowerCase()
    const bn = `${b.firstName} ${b.lastName}`.toLowerCase()
    return an.localeCompare(bn)
  })
}

export function attendanceView(ctx: ViewContext): HTMLElement {
  const root = document.createElement('section')
  root.className =
    'fade-in h-full w-full flex flex-col bg-gradient-to-b from-black to-slate-900 text-white'

  const tz = ctx.timezone
  void (async (): Promise<void> => {
    const stored = (await window.celebAPI.settings.get('attendanceViewMonth')) as
      | string
      | null
      | undefined
    const knownMonths = await window.celebAPI.attendance.getMonths()
    const thisMonth = currentMonthInTz(tz)
    const month = stored ?? (knownMonths.includes(thisMonth) ? thisMonth : knownMonths[0] ?? thisMonth)
    render(root, month, knownMonths, tz)
  })()

  return root
}

async function render(
  root: HTMLElement,
  month: string,
  knownMonths: string[],
  tz: string
): Promise<void> {
  const rows = await window.celebAPI.attendance.getForMonth(month)
  root.replaceChildren()

  const header = document.createElement('div')
  header.className = 'flex items-center justify-between px-8 py-5'
  const title = document.createElement('h2')
  title.className = 'text-[24px] font-semibold'
  title.textContent = monthLabel(month)
  header.appendChild(title)

  const monthSelect = document.createElement('select')
  monthSelect.className =
    'h-9 px-3 rounded-brand bg-slate-800 text-white border border-slate-600'
  const months = knownMonths.length ? knownMonths : [month]
  for (const m of months) {
    const opt = document.createElement('option')
    opt.value = m
    opt.textContent = monthLabel(m)
    if (m === month) opt.selected = true
    monthSelect.appendChild(opt)
  }
  monthSelect.addEventListener('change', async () => {
    await window.celebAPI.settings.set('attendanceViewMonth', monthSelect.value)
    void render(root, monthSelect.value, knownMonths, tz)
  })
  header.appendChild(monthSelect)
  root.appendChild(header)

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'flex-1 flex items-center justify-center text-lg opacity-70'
    empty.textContent = 'Import attendance CSV in Settings →'
    root.appendChild(empty)
    return
  }

  const committed = sortRows(rows.filter((r) => r.count >= 20))
  const consistent = sortRows(rows.filter((r) => r.count >= 12 && r.count < 20))

  const grid = document.createElement('div')
  grid.className = 'flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 px-8 pb-8 min-h-0'
  grid.appendChild(renderColumn('🏆 Committed Club', '20+ Classes', committed, month, 'gold'))
  grid.appendChild(renderColumn('💪 Consistent Club', '12–19 Classes', consistent, month, 'teal'))
  root.appendChild(grid)
}

function renderColumn(
  title: string,
  subtitle: string,
  rows: AttendanceRow[],
  month: string,
  tone: 'gold' | 'teal'
): HTMLElement {
  const col = document.createElement('div')
  col.className =
    'rounded-brand p-5 flex flex-col gap-3 min-h-0 overflow-hidden bg-slate-800/50 border border-slate-700/50'
  const header = document.createElement('div')
  const titleEl = document.createElement('h3')
  titleEl.className = 'text-2xl font-bold'
  titleEl.style.color = tone === 'gold' ? '#FFD700' : '#2dd4bf'
  titleEl.textContent = title
  const sub = document.createElement('div')
  sub.className = 'text-sm opacity-70'
  sub.textContent = `${subtitle} · ${monthLabel(month)}`
  header.appendChild(titleEl)
  header.appendChild(sub)
  col.appendChild(header)

  const list = document.createElement('div')
  list.className = 'flex-1 overflow-y-auto min-h-0 flex flex-col scrollbar-none'
  // Hide scrollbars: Firefox via scrollbar-width, WebKit via the CSS rule below in main.css.
  list.style.scrollbarWidth = 'none'
  list.style.fontSize = fontSizeFor(rows.length)

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'opacity-60 text-center py-8'
    empty.textContent = 'No one in this tier yet.'
    list.appendChild(empty)
  } else {
    rows.forEach((r, i) => {
      const row = document.createElement('div')
      row.className =
        'flex items-center justify-between py-1 px-2 border-b border-white/5 last:border-0'
      if (i === 0 && tone === 'gold') {
        row.style.background =
          'linear-gradient(90deg, rgba(255,215,0,0.12), transparent)'
        row.style.borderLeft = '2px solid #FFD700'
      }
      const left = document.createElement('div')
      left.className = 'flex items-center gap-3 min-w-0'
      const rank = document.createElement('span')
      rank.className = 'text-slate-500 w-6 text-right'
      rank.textContent = String(i + 1)
      const name = document.createElement('span')
      name.className = 'font-medium truncate text-white'
      name.textContent = `${r.firstName} ${r.lastName}`
      left.appendChild(rank)
      left.appendChild(name)
      const badge = document.createElement('span')
      badge.className = 'font-semibold ml-3 px-2 py-0.5 rounded-full bg-white/15 text-white'
      badge.textContent = String(r.count)
      row.appendChild(left)
      row.appendChild(badge)
      list.appendChild(row)
    })
  }
  col.appendChild(list)
  startAutoScroll(list)
  return col
}
