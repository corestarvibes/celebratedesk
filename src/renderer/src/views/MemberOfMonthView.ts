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

const QA_PER_SLIDE = 8 // 2 columns × 4 rows per slide

// Module-level state — survives across re-renders so the main slideshow can
// advance our slide without remounting us.
let currentRoot: HTMLElement | null = null
let currentMember: MotmMember | null = null
let slideIndex = 0
// Tracks the last slide index we actually PAINTED so we can fire the star
// burst exactly once per entry to the hero (slide 0), not on every re-render
// of slide 0 (e.g. when an unrelated state change causes us to remount).
let lastPaintedIndex = -1

function qaSlideCount(m: MotmMember): number {
  return Math.ceil((m.qa?.length ?? 0) / QA_PER_SLIDE)
}

/** Strip any leading "Q:" / "A:" / "Question:" / "Answer:" from stored text.
 *  Historical imports baked these prefixes into the data; the display adds
 *  its own "Q —" / "A —" labels, so leaving them in would double up. Done
 *  at render time so older records auto-clean on view without needing a
 *  destructive DB migration. The Settings "Clean Q:/A: prefixes" button
 *  also offers a permanent scrub. */
const QA_PREFIX_RE = /^\s*(?:q|a|question|answer)\s*[:.)\-–—]\s*/i
function stripQAPrefix(s: string): string {
  return (s ?? '').replace(QA_PREFIX_RE, '').trim()
}

/** Best-effort heuristic: are this member's Q&A pairs swapped?
 *  Signals: more answers end in "?" than questions, OR questions are on average
 *  much longer than answers (answers are usually the longer "essay" text). */
function looksSwapped(m: MotmMember): boolean {
  const qa = m.qa ?? []
  if (qa.length < 2) return false
  let aEndsWithQuestion = 0
  let qEndsWithQuestion = 0
  let qTotalLen = 0
  let aTotalLen = 0
  for (const p of qa) {
    const q = (p.question ?? '').trim()
    const a = (p.answer ?? '').trim()
    if (q.endsWith('?')) qEndsWithQuestion++
    if (a.endsWith('?')) aEndsWithQuestion++
    qTotalLen += q.length
    aTotalLen += a.length
  }
  const moreAnswersAreQuestions = aEndsWithQuestion > qEndsWithQuestion
  const questionsAreLonger = qTotalLen > aTotalLen * 1.6
  return moreAnswersAreQuestions || questionsAreLonger
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
      lastPaintedIndex = -1 // force fresh burst on the new member's hero
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
  if (!currentMember || !currentRoot) {
    // eslint-disable-next-line no-console
    console.log('[motm-view] motmAdvance: no currentMember/root yet — yielding')
    return false
  }
  const total = totalSlideCount(currentMember)
  // eslint-disable-next-line no-console
  console.log(
    '[motm-view] motmAdvance — slideIndex=',
    slideIndex,
    'total=',
    total,
    'qa.length=',
    currentMember.qa.length
  )
  if (slideIndex + 1 < total) {
    slideIndex++
    renderSlide(currentRoot, currentMember, slideIndex)
    return true
  }
  // eslint-disable-next-line no-console
  console.log('[motm-view] last slide reached — resetting & yielding to next view')
  slideIndex = 0
  return false
}

/**
 * Reset internal slide state. Called when the main slideshow (or a manual
 * navigation) leaves this view. Ensures the next entry starts at slide 0.
 */
export function motmReset(): void {
  if (slideIndex !== 0) {
    // eslint-disable-next-line no-console
    console.log('[motm-view] motmReset — slideIndex', slideIndex, '→ 0')
  }
  slideIndex = 0
  // Force the next hero render to fire the star burst (we're leaving, so
  // the next entry should feel fresh).
  lastPaintedIndex = -1
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
    // Fire the star burst when ENTERING the hero from a different slide (or
    // on first render ever). Skip when re-rendering the hero due to an
    // unrelated state change (remount while already on slide 0).
    if (lastPaintedIndex !== 0) {
      fireStarBurst()
    }
    lastPaintedIndex = 0
    return
  }
  const pairIdx = (safeIdx - 1) * QA_PER_SLIDE
  const group = member.qa.slice(pairIdx, pairIdx + QA_PER_SLIDE)
  root.appendChild(renderQAGroup(member, group, safeIdx, qaSlideCount(member)))
  lastPaintedIndex = safeIdx
}

function renderHero(member: MotmMember): HTMLElement {
  // Vertical stack: full-width banner, then the photo below it.
  const wrap = document.createElement('div')
  wrap.className = 'flex-1 flex flex-col min-h-0 bg-black'

  // Big banner across the top separated from the image by a subtle hairline.
  const banner = document.createElement('div')
  banner.className =
    'w-full text-center font-black tracking-wide uppercase py-5 px-6 border-b'
  banner.style.borderBottomColor = 'rgba(56, 189, 248, 0.35)'
  banner.style.background = 'linear-gradient(180deg, rgba(56,189,248,0.22), rgba(0,0,0,0))'
  banner.style.fontSize = 'clamp(36px, 5vh, 64px)'
  // Brand blue, explicit — not reliant on the accentColor override.
  banner.style.color = '#38bdf8'
  banner.style.textShadow = '0 2px 8px rgba(0,0,0,0.6)'
  banner.style.letterSpacing = '0.08em'
  const monthPart = member.activeMonth ? monthLabel(member.activeMonth).split(' ')[0] : ''
  banner.textContent = `⭐ ${monthPart ? monthPart + ' ' : ''}Member of the Month ⭐`
  wrap.appendChild(banner)

  const hero = document.createElement('div')
  hero.className = 'relative flex-1 flex items-center justify-center overflow-hidden min-h-0'
  if (member.photo_url) {
    const img = document.createElement('img')
    img.src = fileUrl(member.photo_url)
    img.alt = member.name
    img.className = 'max-w-full max-h-full object-contain'
    hero.appendChild(img)
    hero.appendChild(renderNameOverlay(member))
  } else {
    hero.style.background = 'linear-gradient(135deg, var(--brand-primary), rgba(0,0,0,0.6))'
    const letter = document.createElement('div')
    letter.className = 'text-[200px] text-white font-black opacity-60'
    letter.textContent = (member.name[0] ?? '?').toUpperCase()
    hero.appendChild(letter)
  }
  wrap.appendChild(hero)
  return wrap
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

  // Top banner — member name between stars, matching the hero slide style.
  const banner = document.createElement('div')
  banner.className =
    'w-full text-center font-black tracking-wide uppercase py-4 px-6 border-b flex-shrink-0'
  banner.style.borderBottomColor = 'rgba(56, 189, 248, 0.35)'
  banner.style.background = 'linear-gradient(180deg, rgba(56,189,248,0.22), rgba(0,0,0,0))'
  banner.style.fontSize = 'clamp(28px, 4vh, 52px)'
  banner.style.color = '#38bdf8'
  banner.style.textShadow = '0 2px 8px rgba(0,0,0,0.6)'
  banner.style.letterSpacing = '0.08em'
  banner.textContent = `⭐ ${member.name.toUpperCase()} ⭐`
  wrap.appendChild(banner)

  // Q&A counter — smaller now that the name is the prominent header.
  const header = document.createElement('div')
  header.className =
    'text-[14px] text-slate-400 font-bold uppercase tracking-[0.25em] mt-4'
  header.textContent = `Q&A ${slideIdx} of ${totalQaSlides}`
  wrap.appendChild(header)

  if (looksSwapped(member)) {
    const fix = document.createElement('button')
    fix.className =
      'absolute top-6 right-6 px-4 py-2 rounded-brand bg-rose-500/30 border border-rose-400 text-rose-100 text-[15px] font-bold cursor-pointer'
    fix.textContent = '↕ Q/A look reversed — tap to fix'
    fix.addEventListener('click', async () => {
      const swapped = {
        ...member,
        qa: member.qa.map((p) => ({ question: p.answer, answer: p.question }))
      }
      await window.celebAPI.motm.upsert(swapped)
      // Force reload of the active member so the view re-renders with fixed data.
      currentMember = null
      slideIndex = 0
      lastPaintedIndex = -1
      if (currentRoot) {
        const refreshed = memberOfMonthView({ events: [], searchQuery: '', timezone: '' })
        currentRoot.replaceChildren(refreshed)
      }
    })
    wrap.appendChild(fix)
  }

  const scroller = document.createElement('div')
  // No explicit max width — use the full viewport for Q&A so each column gets
  // maximum reading room on a big TV.
  scroller.className = 'flex-1 w-full overflow-y-auto min-h-0 scrollbar-none'
  scroller.style.scrollbarWidth = 'none'

  const content = document.createElement('div')
  // Two-column grid. Up to 8 pairs per slide → 4 per column. Large type sizes
  // below may cause the slide to overflow on smaller viewports; the one-way
  // auto-scroller kicks in to cycle through.
  content.className = 'grid gap-x-16 gap-y-10'
  content.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))'
  content.style.padding = '32px 64px'
  content.style.width = '100%'

  pairs.forEach((pair) => {
    const block = document.createElement('div')
    block.className = 'flex flex-col min-w-0'

    // DO NOT SWAP — question first, answer second.
    // The data contract is: pair.question = the question, pair.answer = the
    // answer. If you see Q/A reversed in the app, the DATA is wrong. Use the
    // red "tap to fix" button that appears automatically when the parser
    // detects this, or the Swap Q↔A buttons in Settings.
    // Both Q — and A — labels use the brand blue. Hardcoded so a custom
    // accentColor in settings can't re-tint them to an off-brand color.
    // Sized for 50–55" TV legibility. Will likely overflow a single slide
    // when there are 4 pairs per column — the one-way auto-scroll handles it.
    const qLabel = document.createElement('div')
    qLabel.className = 'font-bold uppercase tracking-[0.3em] mb-2'
    qLabel.style.color = '#38bdf8'
    qLabel.style.fontSize = '20px'
    qLabel.textContent = 'Q —'
    block.appendChild(qLabel)

    const question = document.createElement('div')
    question.className = 'text-white font-bold mb-4'
    question.style.fontSize = '34px'
    question.style.lineHeight = '1.2'
    question.textContent = stripQAPrefix(pair.question)
    block.appendChild(question)

    const aLabel = document.createElement('div')
    aLabel.className = 'font-bold uppercase tracking-[0.3em] mb-2'
    aLabel.style.color = '#38bdf8'
    aLabel.style.fontSize = '17px'
    aLabel.textContent = 'A —'
    block.appendChild(aLabel)

    const answer = document.createElement('div')
    answer.className = 'text-slate-100'
    answer.style.fontSize = '26px'
    answer.style.lineHeight = '1.45'
    answer.textContent = stripQAPrefix(pair.answer)
    block.appendChild(answer)

    content.appendChild(block)
  })

  scroller.appendChild(content)
  wrap.appendChild(scroller)
  startAutoScroll(scroller)

  // (Bottom watermark removed — member name is now in the top banner.)

  return wrap
}

/** One-way auto-scroll for overflowing Q&A content. Scrolls from top to
 *  bottom then parks there until the main slideshow advances to the next
 *  slide. No bounce-back — the next slide will replace the DOM and start
 *  scrolling again from the top. */
function startAutoScroll(container: HTMLElement): void {
  requestAnimationFrame(() => {
    const overflow = container.scrollHeight - container.clientHeight
    if (overflow <= 4) return
    let offset = 0
    let holdUntil = performance.now() + 1500 // pause 1.5s at top
    const PX_PER_FRAME = 0.35 // ~21 px/s at 60 fps
    const step = (now: number): void => {
      if (!container.isConnected) return
      if (now < holdUntil) {
        requestAnimationFrame(step)
        return
      }
      if (offset >= overflow) {
        // Park at bottom. Don't touch scrollTop again; main slideshow will
        // advance this slide out after its interval.
        return
      }
      offset = Math.min(overflow, offset + PX_PER_FRAME)
      container.scrollTop = offset
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}
