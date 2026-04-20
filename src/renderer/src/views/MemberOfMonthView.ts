// Member of the Month view. Internal slide state is driven by the main
// slideshow's tick (see main.ts `motmAdvance`). This guarantees that when
// the slideshow passes through 'motm', we advance through our slides one
// tick at a time and then hand control back to the main loop — previously
// we ran our own setInterval which duplicated timers and caused skipping.

import type { MotmMember, MotmQA } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { fireStarBurst } from '../components/ConfettiOverlay'
import { openSettings } from '../modals/SettingsModal'
import { fileUrl } from '../utils/fileUrl'
import { currentMonthInTz } from '@utils/coachRotation'
import { toast } from '../components/Toast'

const QA_PER_SLIDE = 3

// Module-level state — survives across re-renders so the main slideshow can
// advance our slide without remounting us.
let currentRoot: HTMLElement | null = null
let currentMember: MotmMember | null = null
let slideIndex = 0

function qaSlideCount(m: MotmMember): number {
  return Math.ceil((m.qa?.length ?? 0) / QA_PER_SLIDE)
}

function totalSlideCount(m: MotmMember): number {
  return 1 + qaSlideCount(m)
}

export function memberOfMonthView(_ctx: ViewContext): HTMLElement {
  const root = document.createElement('section')
  root.className = 'fade-in h-full w-full flex flex-col items-stretch'

  void Promise.all([
    window.celebAPI.motm.getActive(),
    window.celebAPI.motm.getAll()
  ]).then(([active, all]) => {
    // eslint-disable-next-line no-console
    console.log(
      '[motm-view] mount — total=',
      all.length,
      ' active=',
      active?.name ?? '(none)'
    )
    if (!active) {
      currentRoot = null
      currentMember = null
      slideIndex = 0
      renderEmptyOrPicker(root, all)
      return
    }
    const memberChanged = !currentMember || currentMember.id !== active.id
    currentRoot = root
    currentMember = active
    if (memberChanged) {
      slideIndex = 0
      fireStarBurst()
    }
    renderSlide(root, active, slideIndex)
  })

  return root
}

/**
 * Called by the main slideshow on each tick while MOTM is active.
 * Returns true if we advanced internally and should stay on this view.
 * Returns false when we've reached the last slide — caller should then
 * advance to the next view. Also resets internal state in that case so
 * the next entry to MOTM starts from the hero again.
 */
export function motmAdvance(): boolean {
  if (!currentMember || !currentRoot) return false
  const total = totalSlideCount(currentMember)
  if (slideIndex + 1 < total) {
    slideIndex++
    renderSlide(currentRoot, currentMember, slideIndex)
    // eslint-disable-next-line no-console
    console.log('[motm-view] advanced internal slide → idx=', slideIndex, '/', total)
    return true
  }
  // eslint-disable-next-line no-console
  console.log('[motm-view] last slide reached — yielding to next view')
  slideIndex = 0
  return false
}

function renderEmptyOrPicker(root: HTMLElement, members: MotmMember[]): void {
  root.replaceChildren()
  const wrap = document.createElement('div')
  wrap.className = 'flex-1 flex flex-col items-center justify-center gap-4 p-8 opacity-90'

  const star = document.createElement('div')
  star.className = 'text-6xl'
  star.textContent = '⭐'
  wrap.appendChild(star)

  if (members.length === 0) {
    const msg = document.createElement('p')
    msg.className = 'text-lg'
    msg.textContent = 'No Member of the Month yet.'
    wrap.appendChild(msg)
    const btn = document.createElement('button')
    btn.className = 'btn btn-primary mt-2'
    btn.textContent = 'Add one in Settings →'
    btn.addEventListener('click', () => openSettings('motm'))
    wrap.appendChild(btn)
  } else {
    const msg = document.createElement('p')
    msg.className = 'text-lg'
    msg.textContent = `No one is set as active. Pick from your ${members.length} member${members.length === 1 ? '' : 's'}:`
    wrap.appendChild(msg)
    const list = document.createElement('div')
    list.className = 'flex flex-col gap-2 max-w-md w-full'
    for (const m of members) {
      const row = document.createElement('button')
      row.className = 'surface p-3 flex items-center gap-3 text-left hover:brightness-110'
      const thumb = document.createElement('div')
      thumb.className =
        'w-10 h-10 rounded-brand overflow-hidden bg-slate-700 flex-shrink-0 flex items-center justify-center'
      if (m.photo_url) {
        const img = document.createElement('img')
        img.src = fileUrl(m.photo_url)
        img.className = 'w-full h-full object-cover'
        thumb.appendChild(img)
      } else {
        thumb.textContent = '⭐'
      }
      row.appendChild(thumb)
      const name = document.createElement('span')
      name.className = 'flex-1 font-semibold'
      name.textContent = m.name
      row.appendChild(name)
      const go = document.createElement('span')
      go.className = 'days-badge'
      go.textContent = 'Make active'
      row.appendChild(go)
      row.addEventListener('click', async () => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        await window.celebAPI.motm.setActive(m.id, currentMonthInTz(tz))
        toast(`${m.name} is now the Member of the Month`, 'success')
        root.replaceChildren()
        const refreshed = memberOfMonthView({ events: [], searchQuery: '', timezone: tz })
        root.appendChild(refreshed)
      })
      list.appendChild(row)
    }
    wrap.appendChild(list)
  }

  root.appendChild(wrap)
}

function renderSlide(root: HTMLElement, member: MotmMember, idx: number): void {
  const total = totalSlideCount(member)
  const safeIdx = Math.max(0, Math.min(idx, total - 1))
  root.replaceChildren()
  // eslint-disable-next-line no-console
  console.log(
    '[motm-view] rendering slide',
    safeIdx,
    '/',
    total,
    '| qa pairs=',
    member.qa.length
  )
  if (safeIdx === 0) {
    root.appendChild(renderHero(member))
    return
  }
  const pairIdx = (safeIdx - 1) * QA_PER_SLIDE
  const group = member.qa.slice(pairIdx, pairIdx + QA_PER_SLIDE)
  root.appendChild(renderQAGroup(member, group, safeIdx, qaSlideCount(member)))
}

function renderHero(member: MotmMember): HTMLElement {
  const hero = document.createElement('div')
  hero.className = 'relative flex-1 flex items-center justify-center bg-black overflow-hidden'
  if (member.photo_url) {
    const img = document.createElement('img')
    img.src = fileUrl(member.photo_url)
    img.alt = member.name
    img.className = 'max-w-full max-h-full object-contain'
    hero.appendChild(img)
    hero.appendChild(renderNameOverlay(member))
  } else {
    hero.classList.add('bg-gradient-to-br')
    hero.style.background =
      'linear-gradient(135deg, var(--brand-primary), rgba(0,0,0,0.6))'
    const letter = document.createElement('div')
    letter.className = 'text-[200px] text-white font-black opacity-60'
    letter.textContent = (member.name[0] ?? '?').toUpperCase()
    hero.appendChild(letter)
  }
  const badge = document.createElement('div')
  badge.className =
    'absolute top-4 right-4 px-3 py-1.5 rounded-brand text-sm font-semibold bg-black/60 text-white backdrop-blur-sm'
  badge.textContent = `⭐ Member of the Month${member.activeMonth ? ' · ' + monthLabel(member.activeMonth) : ''}`
  hero.appendChild(badge)
  return hero
}

function monthLabel(ym: string | undefined): string {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function renderNameOverlay(member: MotmMember): HTMLElement {
  const parts = member.name.trim().split(/\s+/)
  const first = (parts[0] ?? '').toUpperCase()
  const last = parts.slice(1).join(' ').toUpperCase()
  const style = member.nameStyle ?? 'diagonal'
  const container = document.createElement('div')
  container.className = 'pointer-events-none absolute inset-0'

  const shadow =
    '0 2px 6px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.7), 2px 2px 0 #1f2937'

  if (style === 'vertical') {
    const left = document.createElement('div')
    left.className = 'absolute top-1/2 -translate-y-1/2 flex flex-col items-center font-black'
    left.style.left = '4%'
    left.style.color = '#fff'
    left.style.textShadow = shadow
    left.style.lineHeight = '0.95'
    left.style.fontSize = 'clamp(28px, 7vh, 72px)'
    for (const ch of first) {
      const span = document.createElement('div')
      span.textContent = ch
      left.appendChild(span)
    }
    container.appendChild(left)
    if (last) {
      const right = document.createElement('div')
      right.className = 'absolute top-1/2 -translate-y-1/2 flex flex-col items-center font-black'
      right.style.right = '4%'
      right.style.color = '#fff'
      right.style.textShadow = shadow
      right.style.lineHeight = '0.95'
      right.style.fontSize = 'clamp(28px, 7vh, 72px)'
      for (const ch of last) {
        const span = document.createElement('div')
        span.textContent = ch
        right.appendChild(span)
      }
      container.appendChild(right)
    }
  } else if (style === 'horizontal') {
    const line = document.createElement('div')
    line.className = 'absolute left-0 right-0 text-center font-black italic'
    line.style.top = '6%'
    line.style.color = '#fff'
    line.style.textShadow = shadow
    line.style.fontSize = 'clamp(28px, 9vh, 96px)'
    line.style.letterSpacing = '0.02em'
    line.textContent = `${first}${last ? ' ' + last : ''}`
    container.appendChild(line)
  } else {
    const topLeft = document.createElement('div')
    topLeft.className = 'absolute font-black italic'
    topLeft.style.left = '4%'
    topLeft.style.top = '6%'
    topLeft.style.color = '#fff'
    topLeft.style.textShadow = shadow
    topLeft.style.fontSize = 'clamp(28px, 10vh, 110px)'
    topLeft.textContent = first
    container.appendChild(topLeft)
    if (last) {
      const bottomRight = document.createElement('div')
      bottomRight.className = 'absolute font-black italic'
      bottomRight.style.right = '4%'
      bottomRight.style.bottom = '8%'
      bottomRight.style.color = '#fff'
      bottomRight.style.textShadow = shadow
      bottomRight.style.fontSize = 'clamp(28px, 10vh, 110px)'
      bottomRight.textContent = last
      container.appendChild(bottomRight)
    }
  }
  return container
}

// Q&A group slide — up to QA_PER_SLIDE pairs on one slide, each showing the
// question and answer together. Auto-scrolls slowly if content overflows.
function renderQAGroup(
  member: MotmMember,
  pairs: MotmQA[],
  slideIdx: number,
  totalQaSlides: number
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className =
    'relative flex-1 flex flex-col items-center bg-gradient-to-b from-black to-slate-900 text-slate-100 overflow-hidden'

  const header = document.createElement('div')
  header.className =
    'text-xs text-slate-400 font-bold uppercase tracking-[0.25em] mt-6'
  header.textContent = `Q&A ${slideIdx} of ${totalQaSlides}`
  wrap.appendChild(header)

  const scroller = document.createElement('div')
  scroller.className = 'flex-1 w-full max-w-3xl overflow-y-auto min-h-0 scrollbar-none'
  scroller.style.scrollbarWidth = 'none'

  const content = document.createElement('div')
  // Per spec: padding 32px sides, 24px top/bottom
  content.className = 'flex flex-col gap-6'
  content.style.padding = '24px 32px'

  pairs.forEach((pair, i) => {
    const block = document.createElement('div')
    block.className = 'flex flex-col'

    const qLabel = document.createElement('div')
    qLabel.className = 'text-amber-400 font-bold uppercase tracking-[0.25em] mb-1'
    qLabel.style.fontSize = '13px'
    qLabel.textContent = 'Q —'
    block.appendChild(qLabel)

    const question = document.createElement('div')
    question.className = 'text-white font-semibold mb-4'
    question.style.fontSize = '18px'
    question.style.lineHeight = '1.4'
    question.textContent = pair.question
    block.appendChild(question)

    const aLabel = document.createElement('div')
    aLabel.className = 'text-slate-400 font-bold uppercase tracking-[0.25em] mb-1'
    aLabel.style.fontSize = '13px'
    aLabel.textContent = 'A —'
    block.appendChild(aLabel)

    const answer = document.createElement('div')
    answer.className = 'text-slate-100'
    answer.style.fontSize = '16px'
    answer.style.lineHeight = '1.7'
    answer.textContent = pair.answer
    block.appendChild(answer)

    content.appendChild(block)

    if (i < pairs.length - 1) {
      const divider = document.createElement('hr')
      divider.className = 'border-slate-700'
      content.appendChild(divider)
    }
  })

  scroller.appendChild(content)
  wrap.appendChild(scroller)
  startAutoScroll(scroller)

  // Fixed member watermark (doesn't scroll)
  const watermark = document.createElement('div')
  watermark.className =
    'absolute bottom-3 right-4 flex items-center gap-2 text-xs text-slate-300 bg-black/40 px-2 py-1 rounded-brand'
  if (member.photo_url) {
    const img = document.createElement('img')
    img.src = fileUrl(member.photo_url)
    img.className = 'w-6 h-6 rounded-full object-cover'
    watermark.appendChild(img)
  }
  const first = member.name.split(/\s+/)[0] ?? member.name
  const name = document.createElement('span')
  name.className = 'font-semibold'
  name.textContent = first
  watermark.appendChild(name)
  wrap.appendChild(watermark)

  return wrap
}

/** Slow auto-scroll for overflowing Q&A content. ~20 px/s, 1.5s pauses. */
function startAutoScroll(container: HTMLElement): void {
  requestAnimationFrame(() => {
    const overflow = container.scrollHeight - container.clientHeight
    if (overflow <= 4) return
    let offset = 0
    let dir = 1
    let holdUntil = performance.now() + 1500
    const PX_PER_FRAME = 0.35 // ~21 px/s at 60 fps
    const HOLD_MS = 1500
    const step = (now: number): void => {
      if (!container.isConnected) return
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
      container.scrollTop = offset
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}
