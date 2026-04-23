import QRCode from 'qrcode'
import type { QRCodeEntry } from '@shared/types'
import type { ViewContext } from './viewRegistry'

const QR_PX = 380

async function renderQRCanvas(url: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  try {
    await QRCode.toCanvas(canvas, url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: QR_PX * 2, // higher resolution bitmap, scaled down to QR_PX CSS
      color: { dark: '#1e293b', light: '#ffffff' }
    })
  } catch (err) {
    canvas.width = QR_PX * 2
    canvas.height = QR_PX * 2
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#fb7185'
      ctx.font = '600 24px ui-sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Invalid URL', canvas.width / 2, canvas.height / 2)
    }
    console.error('[qr] generate failed', err)
  }
  // Fixed display size — 200px × 200px regardless of canvas bitmap resolution.
  canvas.style.width = `${QR_PX}px`
  canvas.style.height = `${QR_PX}px`
  canvas.style.flexShrink = '0'
  canvas.style.background = '#fff'
  canvas.style.padding = '8px'
  canvas.style.borderRadius = 'var(--brand-radius)'
  canvas.style.boxSizing = 'content-box'
  return canvas
}

export function qrCodesView(_ctx: ViewContext): HTMLElement {
  const root = document.createElement('section')
  root.className =
    'fade-in h-full w-full bg-gradient-to-b from-black to-slate-900 text-white flex flex-col gap-4 p-6'

  const header = document.createElement('h2')
  header.className = 'text-[36px] font-bold'
  header.textContent = 'Scan to connect'
  root.appendChild(header)

  const grid = document.createElement('div')
  // Single row of 4 cards across the whole screen — better for a 50" TV
  // viewed from across the room than a 2×2 with half-sized codes.
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))'
  grid.style.gap = '20px'
  grid.style.flex = '1 1 0%'
  grid.style.minHeight = '0'
  grid.style.width = '100%'
  grid.style.alignItems = 'stretch'
  root.appendChild(grid)

  void window.celebAPI.settings.get('qrCodes').then(async (raw) => {
    const codes = Array.isArray(raw) ? (raw as QRCodeEntry[]) : []
    if (codes.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'flex-1 flex items-center justify-center opacity-70'
      empty.textContent = 'Add QR codes in Settings →'
      root.appendChild(empty)
      return
    }
    for (const entry of codes) {
      grid.appendChild(await renderCard(entry))
    }
  })

  return root
}

async function renderCard(entry: QRCodeEntry): Promise<HTMLElement> {
  const card = document.createElement('div')
  // Explicit flex-column layout per spec — no absolute positioning anywhere.
  card.style.display = 'flex'
  card.style.flexDirection = 'column'
  card.style.alignItems = 'center'
  card.style.justifyContent = 'center'
  card.style.gap = '8px'
  card.style.padding = '16px'
  card.style.backgroundColor = 'rgb(30, 41, 59)' // slate-800
  card.style.borderRadius = 'var(--brand-radius)'
  card.style.color = '#ffffff'
  card.style.textAlign = 'center'
  card.style.minHeight = '0'
  card.style.minWidth = '0'
  card.style.overflow = 'hidden'

  // 1. Emoji
  const icon = document.createElement('div')
  icon.style.fontSize = '64px'
  icon.style.lineHeight = '1'
  icon.style.flexShrink = '0'
  icon.textContent = entry.icon || '📱'
  card.appendChild(icon)

  // 2. QR code
  const canvas = await renderQRCanvas(entry.url)
  card.appendChild(canvas)

  // 3. Label
  const label = document.createElement('div')
  label.style.fontSize = '30px'
  label.style.fontWeight = '700'
  label.style.color = '#ffffff'
  label.style.textAlign = 'center'
  label.style.lineHeight = '1.2'
  label.style.flexShrink = '0'
  label.textContent = entry.label || '(no label)'
  card.appendChild(label)

  // 4. URL (keep small — display-wall viewers aren't reading full URLs)
  const urlEl = document.createElement('div')
  urlEl.style.fontSize = '12px'
  urlEl.style.color = 'rgb(148, 163, 184)' // slate-400
  urlEl.style.textAlign = 'center'
  urlEl.style.maxWidth = '100%'
  urlEl.style.overflow = 'hidden'
  urlEl.style.textOverflow = 'ellipsis'
  urlEl.style.whiteSpace = 'nowrap'
  urlEl.style.flexShrink = '0'
  urlEl.textContent = entry.url
  urlEl.title = entry.url
  card.appendChild(urlEl)

  return card
}
