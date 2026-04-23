// High-end digital-signage Events view. Split layout: photo (or animated
// gradient) on the left with overlays, dark sidebar on the right with event
// details + optional QR. Cycles one event per slide, MOTM-style, with the
// advance hook wired into the main slideshow.

import QRCode from 'qrcode'
import type { CelebEventComputed } from '@shared/types'
import type { ViewContext } from './viewRegistry'
import { formatDisplayDate } from '@utils/dateHelpers'
import { fileUrl } from '../utils/fileUrl'
import { openEventForm } from '../modals/EventFormModal'
import { celebrateIfNewDay } from '../components/ConfettiOverlay'
import { getState } from '../state'

// Only include types users would think of as "events" — not birthdays/anniversaries.
const EVENT_TYPES = new Set<CelebEventComputed['type']>(['event', 'custom'])
const HORIZON_DAYS = 180

let currentRoot: HTMLElement | null = null
let cached: CelebEventComputed[] = []
let slideIndex = 0
let lastConfettiKey: string | null = null

function getUpcoming(events: CelebEventComputed[]): CelebEventComputed[] {
  return events
    .filter((e) => EVENT_TYPES.has(e.type) && e.daysUntil >= 0 && e.daysUntil <= HORIZON_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

export function eventsView(ctx: ViewContext): HTMLElement {
  const root = document.createElement('section')
  root.className = 'h-full w-full flex flex-col items-stretch bg-black text-slate-100 font-ui'

  currentRoot = root
  cached = getUpcoming(ctx.events)
  if (cached.length === 0) {
    slideIndex = 0
    renderEmpty(root)
    return root
  }
  slideIndex = Math.min(slideIndex, cached.length - 1)
  renderSlide(root, cached[slideIndex]!, ctx.timezone)
  return root
}

/** Called by the main slideshow. Returns true if we advanced internally;
 *  false when we've shown all events — caller moves to the next view. */
export function eventsAdvance(): boolean {
  if (!currentRoot || cached.length === 0) return false
  if (slideIndex + 1 < cached.length) {
    slideIndex++
    renderSlide(
      currentRoot,
      cached[slideIndex]!,
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
    return true
  }
  slideIndex = 0
  return false
}

export function eventsReset(): void {
  slideIndex = 0
  lastConfettiKey = null
}

function renderEmpty(root: HTMLElement): void {
  root.replaceChildren()
  const wrap = document.createElement('div')
  wrap.className =
    'flex-1 flex flex-col items-center justify-center gap-5 p-10 text-slate-300 events-gradient-bg events-fade-in'
  const icon = document.createElement('div')
  icon.className = 'font-display'
  icon.style.fontSize = 'clamp(80px, 12vw, 160px)'
  icon.style.opacity = '0.35'
  icon.textContent = 'NO EVENTS'
  wrap.appendChild(icon)

  const msg = document.createElement('p')
  msg.style.fontSize = '22px'
  msg.style.fontWeight = '600'
  msg.textContent = 'Nothing upcoming in the next 6 months.'
  wrap.appendChild(msg)

  const btn = document.createElement('button')
  btn.className = 'btn btn-primary mt-4'
  btn.textContent = '＋ Create an event'
  btn.addEventListener('click', () =>
    openEventForm({
      id: '',
      name: '',
      type: 'event',
      date: new Date().toISOString().slice(0, 10),
      recurring: false,
      nextOccurrence: new Date().toISOString().slice(0, 10),
      daysUntil: 0,
      source: 'manual',
      createdAt: '',
      updatedAt: ''
    } as CelebEventComputed)
  )
  wrap.appendChild(btn)
  root.appendChild(wrap)
}

function renderSlide(
  root: HTMLElement,
  ev: CelebEventComputed,
  timezone: string
): void {
  root.replaceChildren()
  root.appendChild(renderEventLayout(ev, timezone))

  // Fire the birthday/celebration confetti once per "today" event shown.
  if (ev.daysUntil === 0) {
    const key = `events-today-${ev.id}`
    if (key !== lastConfettiKey) {
      lastConfettiKey = key
      celebrateIfNewDay(key)
    }
  }
}

function formatRange(start: string, end: string | undefined, tz: string): string {
  const startLabel = formatDisplayDate(start, tz)
  if (!end || end === start) return startLabel
  try {
    return `${startLabel} – ${formatDisplayDate(end, tz)}`
  } catch {
    return startLabel
  }
}

async function renderQRCanvas(url: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  try {
    await QRCode.toCanvas(canvas, url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
  } catch {
    canvas.width = 320
    canvas.height = 320
  }
  canvas.style.width = '160px'
  canvas.style.height = '160px'
  canvas.style.background = '#ffffff'
  canvas.style.padding = '12px'
  canvas.style.borderRadius = '8px'
  canvas.style.flexShrink = '0'
  return canvas
}

function typeWatermark(type: CelebEventComputed['type']): string {
  // Only 'event' / 'custom' reach this code path — still, keep generic.
  return (type ?? 'EVENT').toUpperCase()
}

function renderEventLayout(ev: CelebEventComputed, timezone: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'flex-1 min-h-0 flex overflow-hidden relative events-fade-in'

  // ─── Left side — photo or gradient (65%) ──────────────────────────
  const left = document.createElement('div')
  left.className = 'relative overflow-hidden'
  left.style.flex = '0 0 65%'
  left.style.minWidth = '0'

  if (ev.photo_url) {
    const src = fileUrl(ev.photo_url)

    // Backdrop — same image, cover-scaled and heavily blurred/dimmed. Fills
    // the letterbox space gracefully so there are no harsh black bars when
    // the main image has a different aspect ratio from the 65%-wide column.
    const backdrop = document.createElement('img')
    backdrop.src = src
    backdrop.alt = ''
    backdrop.className = 'absolute inset-0 w-full h-full object-cover'
    backdrop.style.filter = 'blur(30px) brightness(0.45) saturate(1.1)'
    backdrop.style.transform = 'scale(1.1)' // hide blur-edge bleeding
    backdrop.setAttribute('aria-hidden', 'true')
    left.appendChild(backdrop)

    // Foreground — the actual image, `object-contain` so nothing gets
    // cropped. The blurred backdrop picks up any remaining space.
    const img = document.createElement('img')
    img.src = src
    img.alt = ev.name
    img.className = 'absolute inset-0 w-full h-full object-contain'
    left.appendChild(img)
  } else {
    // Deep animated gradient fallback.
    left.classList.add('events-gradient-bg')

    // Huge type watermark, very low opacity, for subtle texture.
    const watermark = document.createElement('div')
    watermark.className = 'absolute inset-0 flex items-center justify-center font-display'
    watermark.style.fontSize = '20vw'
    watermark.style.lineHeight = '1'
    watermark.style.color = '#ffffff'
    watermark.style.opacity = '0.05'
    watermark.style.whiteSpace = 'nowrap'
    watermark.style.pointerEvents = 'none'
    watermark.textContent = typeWatermark(ev.type)
    left.appendChild(watermark)
  }

  // Logo top-left (if workspace logo is set)
  const logoPath = getState().settings?.logoPath
  if (logoPath) {
    const logoImg = document.createElement('img')
    logoImg.src = fileUrl(logoPath)
    logoImg.className = 'brand-logo absolute'
    logoImg.style.top = '24px'
    logoImg.style.left = '24px'
    logoImg.style.height = '40px'
    logoImg.style.width = 'auto'
    logoImg.style.opacity = '0.7'
    left.appendChild(logoImg)
  }

  // Dot indicators bottom-center — only if multiple events queued.
  if (cached.length > 1) {
    const dots = document.createElement('div')
    dots.className = 'absolute flex gap-2.5'
    dots.style.bottom = '24px'
    dots.style.left = '50%'
    dots.style.transform = 'translateX(-50%)'
    for (let i = 0; i < cached.length; i++) {
      const dot = document.createElement('span')
      dot.style.width = '10px'
      dot.style.height = '10px'
      dot.style.borderRadius = '9999px'
      dot.style.transition = 'all 200ms ease'
      if (i === slideIndex) {
        dot.style.backgroundColor = '#38bdf8'
        dot.style.boxShadow = '0 0 8px rgba(56,189,248,0.6)'
      } else {
        dot.style.background = 'transparent'
        dot.style.border = '1.5px solid rgba(148, 163, 184, 0.7)'
      }
      dots.appendChild(dot)
    }
    left.appendChild(dots)
  }

  wrap.appendChild(left)

  // ─── Thin vertical accent with glow ───────────────────────────────
  const accent = document.createElement('div')
  accent.style.width = '3px'
  accent.style.flexShrink = '0'
  accent.style.background = '#38bdf8'
  accent.style.boxShadow = '0 0 24px rgba(56, 189, 248, 0.7), 0 0 48px rgba(56, 189, 248, 0.35)'
  wrap.appendChild(accent)

  // ─── Right sidebar (35%) ──────────────────────────────────────────
  const right = document.createElement('div')
  right.className = 'flex flex-col overflow-hidden'
  right.style.flex = '1 1 0%'
  right.style.minWidth = '0'
  right.style.backgroundColor = '#0f172a'
  right.style.padding = '40px 32px'

  // 1. Top badge — COMING UP · IN N DAYS / HAPPENING TODAY 🎉
  const badge = document.createElement('div')
  badge.style.fontFamily = "'Montserrat', sans-serif"
  badge.style.fontSize = '13px'
  badge.style.fontWeight = '600'
  badge.style.letterSpacing = '0.15em'
  badge.style.color = '#38bdf8'
  badge.style.marginBottom = '20px'
  if (ev.daysUntil === 0) {
    badge.textContent = 'HAPPENING TODAY 🎉'
  } else if (ev.daysUntil === 1) {
    badge.textContent = 'COMING UP · TOMORROW'
  } else {
    badge.textContent = `COMING UP · IN ${ev.daysUntil} DAYS`
  }
  right.appendChild(badge)

  // 2. Event name — Bebas Neue, giant
  const name = document.createElement('div')
  name.className = 'font-display'
  name.style.fontSize = 'clamp(48px, 4.8vw, 84px)'
  name.style.lineHeight = '1'
  name.style.color = '#ffffff'
  name.style.textShadow = '0 2px 4px rgba(0,0,0,0.5)'
  name.style.marginBottom = '28px'
  name.style.wordBreak = 'break-word'
  name.textContent = ev.name
  right.appendChild(name)

  // 3. Details block — icons + data, skip empty fields
  const details = document.createElement('div')
  details.style.display = 'flex'
  details.style.flexDirection = 'column'
  details.style.gap = '12px'
  details.style.fontFamily = "'Montserrat', sans-serif"
  details.style.fontSize = '17px'
  details.style.fontWeight = '600'
  details.style.color = '#ffffff'

  const dateLine = document.createElement('div')
  dateLine.textContent = `📅  ${formatRange(ev.date, ev.end_date, timezone)}`
  details.appendChild(dateLine)

  if (ev.location) {
    const locLine = document.createElement('div')
    locLine.textContent = `📍  ${ev.location}`
    details.appendChild(locLine)
  }
  right.appendChild(details)

  // 4. About block (if notes set)
  if (ev.notes) {
    const aboutWrap = document.createElement('div')
    aboutWrap.style.marginTop = '24px'
    aboutWrap.style.paddingTop = '20px'
    aboutWrap.style.borderTop = '1px solid rgba(255,255,255,0.1)'

    const aboutLabel = document.createElement('div')
    aboutLabel.style.fontFamily = "'Montserrat', sans-serif"
    aboutLabel.style.fontSize = '11px'
    aboutLabel.style.fontWeight = '600'
    aboutLabel.style.letterSpacing = '0.15em'
    aboutLabel.style.color = '#38bdf8'
    aboutLabel.style.marginBottom = '10px'
    aboutLabel.textContent = 'ABOUT THIS EVENT'
    aboutWrap.appendChild(aboutLabel)

    const notesText = document.createElement('div')
    notesText.style.fontFamily = "'Montserrat', sans-serif"
    notesText.style.fontSize = '15px'
    notesText.style.fontWeight = '400'
    notesText.style.color = '#cbd5e1' // slate-300
    notesText.style.lineHeight = '1.7'
    notesText.style.display = '-webkit-box'
    ;(notesText.style as unknown as Record<string, string>).webkitBoxOrient = 'vertical'
    ;(notesText.style as unknown as Record<string, string>).webkitLineClamp = '5'
    notesText.style.overflow = 'hidden'
    // Bottom fade if the clamped text is truncated
    notesText.style.maskImage =
      'linear-gradient(180deg, #000 70%, rgba(0,0,0,0.15) 100%)'
    ;(notesText.style as unknown as Record<string, string>).webkitMaskImage =
      'linear-gradient(180deg, #000 70%, rgba(0,0,0,0.15) 100%)'
    notesText.textContent = ev.notes
    aboutWrap.appendChild(notesText)

    right.appendChild(aboutWrap)
  }

  // 5. Spacer pushes QR to the bottom
  const spacer = document.createElement('div')
  spacer.style.flex = '1'
  right.appendChild(spacer)

  // 6. QR block (bottom)
  if (ev.event_url) {
    const qrBlock = document.createElement('div')
    qrBlock.style.display = 'flex'
    qrBlock.style.flexDirection = 'column'
    qrBlock.style.alignItems = 'flex-start'
    qrBlock.style.gap = '10px'

    const qrLabel = document.createElement('div')
    qrLabel.style.fontFamily = "'Montserrat', sans-serif"
    qrLabel.style.fontSize = '11px'
    qrLabel.style.fontWeight = '600'
    qrLabel.style.letterSpacing = '0.15em'
    qrLabel.style.color = '#38bdf8'
    // Label switches to "REGISTER" if URL contains sign-up/register; otherwise "LEARN MORE".
    const wantRegister = /\b(register|signup|sign-up|dropin|dropIns|booking)\b/i.test(
      ev.event_url
    )
    qrLabel.textContent = wantRegister ? 'SCAN TO REGISTER' : 'SCAN TO LEARN MORE'
    qrBlock.appendChild(qrLabel)

    void renderQRCanvas(ev.event_url).then((c) => qrBlock.appendChild(c))

    right.appendChild(qrBlock)
  }

  wrap.appendChild(right)
  return wrap
}
