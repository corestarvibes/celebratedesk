import type { AttendanceRow } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { currentMonthInTz, previousMonth } from '@utils/coachRotation'
import { fitToViewport } from '../utils/fitToViewport'

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function fontSizeFor(n: number): string {
  // Scaled up for 50–55" TV viewing distance. Drops as the list grows so the
  // whole tier remains on-screen without scrolling for typical class sizes.
  if (n <= 6) return '36px'
  if (n <= 10) return '30px'
  if (n <= 16) return '26px'
  if (n <= 22) return '22px'
  if (n <= 30) return '19px'
  if (n <= 42) return '16px'
  return '14px'
}

// Auto-scroll helper was removed — attendance now splits into 2–3 sub-columns
// when the list exceeds ~20 names, which eliminates the need to scroll.

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
    const prevMonth = previousMonth(thisMonth)
    // ChalkItPro attendance is always a month behind — the current month
    // isn't complete until it ends. Always prefer the previous month, even
    // if rows for the current month happen to exist (would only be true if
    // the user manually labeled placeholder data with the current month).
    // The user can still override via the in-view dropdown, which writes
    // `attendanceViewMonth`.
    const month =
      stored ??
      (knownMonths.includes(prevMonth)
        ? prevMonth
        : (knownMonths[0] ?? prevMonth))
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
  title.className = 'text-[40px] font-bold'
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
  grid.appendChild(renderColumn('🏆 Committed Club', '20+ Classes', committed, month, 'brand'))
  grid.appendChild(renderColumn('💪 Consistent Club', '12–19 Classes', consistent, month, 'slate'))
  root.appendChild(grid)
}

function renderColumn(
  title: string,
  subtitle: string,
  rows: AttendanceRow[],
  month: string,
  tone: 'brand' | 'slate'
): HTMLElement {
  const col = document.createElement('div')
  col.className =
    'rounded-brand p-5 flex flex-col gap-3 min-h-0 overflow-hidden bg-slate-800/50 border border-slate-700/50'
  // Solid header pill — brand blue for Committed, slate for Consistent.
  const header = document.createElement('div')
  header.className = 'px-5 py-3 rounded-brand flex flex-col gap-0.5'
  if (tone === 'brand') {
    header.style.backgroundColor = '#38bdf8'
    header.style.color = '#0f172a' // slate-900 text for contrast on bright blue
  } else {
    header.style.backgroundColor = '#475569' // slate-600
    header.style.color = '#ffffff'
  }
  const titleEl = document.createElement('h3')
  titleEl.className = 'text-[32px] font-black leading-tight'
  titleEl.textContent = title
  const sub = document.createElement('div')
  sub.className = 'text-[16px] opacity-85 font-medium'
  sub.textContent = `${subtitle} · ${monthLabel(month)}`
  header.appendChild(titleEl)
  header.appendChild(sub)
  col.appendChild(header)

  // When the tier gets crowded, split the list into 2 or 3 sub-columns to
  // keep font sizes readable and avoid any scrolling. Each row stays intact.
  const subColumns =
    tone === 'brand'
      ? rows.length > 18
        ? 3
        : rows.length > 5
          ? 2
          : 1
      : rows.length > 30
        ? 3
        : rows.length > 20
          ? 2
          : 1

  const list = document.createElement('div')
  list.className = 'flex-1 min-h-0 w-full overflow-hidden'

  const listContent = document.createElement('div')
  listContent.className = 'flex w-full'
  // Baseline font size reflects total row count (curve defined in fontSizeFor).
  listContent.style.fontSize = `calc(${fontSizeFor(rows.length)} * var(--fit-scale, 1))`
  listContent.style.gap = 'calc(16px * var(--fit-scale, 1))'

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'opacity-60 text-center py-8 flex-1'
    empty.textContent = 'No one in this tier yet.'
    listContent.appendChild(empty)
  } else {
    // Split the rows across `subColumns` columns, preserving the overall rank.
    const perCol = Math.ceil(rows.length / subColumns)
    for (let c = 0; c < subColumns; c++) {
      const subCol = document.createElement('div')
      subCol.className = 'flex flex-col flex-1 min-w-0'
      const chunk = rows.slice(c * perCol, (c + 1) * perCol)
      chunk.forEach((r, iInChunk) => {
        const globalIdx = c * perCol + iInChunk
        const row = document.createElement('div')
        row.className =
          'grid items-baseline border-b border-white/5 last:border-0 text-white'
        row.style.gap = 'calc(12px * var(--fit-scale, 1))'
        row.style.padding =
          'calc(6px * var(--fit-scale, 1)) calc(8px * var(--fit-scale, 1))'
        row.style.gridTemplateColumns =
          'minmax(calc(2.25rem * var(--fit-scale, 1)), auto) 1fr auto'
        if (globalIdx === 0 && tone === 'brand') {
          // Top Committed Club member gets a subtle accent highlight.
          row.style.background =
            'linear-gradient(90deg, rgba(56,189,248,0.18), transparent)'
          row.style.borderLeft = '3px solid #38bdf8'
        }

        const rank = document.createElement('span')
        rank.className = 'text-slate-500 text-right font-semibold'
        rank.textContent = String(globalIdx + 1)
        row.appendChild(rank)

        const nameWrap = document.createElement('span')
        nameWrap.className = 'font-semibold truncate min-w-0'
        nameWrap.textContent = `${r.firstName} ${r.lastName}`
        row.appendChild(nameWrap)

        const badge = document.createElement('span')
        badge.className =
          'font-bold rounded-full bg-white/15 text-white tabular-nums'
        badge.style.padding =
          'calc(2px * var(--fit-scale, 1)) calc(12px * var(--fit-scale, 1))'
        badge.textContent = String(r.count)
        row.appendChild(badge)

        subCol.appendChild(row)
      })
      listContent.appendChild(subCol)
    }
  }
  list.appendChild(listContent)
  col.appendChild(list)
  fitToViewport(list, listContent, { mode: 'css-var', minScale: 0.78 })
  return col
}
