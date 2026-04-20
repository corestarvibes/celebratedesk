// Hand-rolled confetti. Replaces canvas-confetti because its internal resize
// logic mis-sized the canvas in Electron, causing particles to render off-screen.

/* eslint-disable no-console */
console.log('[confetti] module loaded (hand-rolled)')

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  color: string
  size: number
  alpha: number
  kind: 'square' | 'star'
}

const COLORS = ['#f59e0b', '#fde68a', '#fb923c', '#fef3c7', '#fb7185', '#22c55e', '#3b82f6']
const STAR_COLORS = ['#FFD700', '#FFF8DC', '#f59e0b', '#ffffff', '#FFA500']

// Throttle: skip if the last burst fired < 60 seconds ago. Prevents spam if
// the Today view re-renders frequently (keyboard nav, data refresh, etc.).
// Currently BYPASSED (see celebrateIfNewDay) for debugging. When restoring
// the throttle check, uncomment the const below.
// const BURST_THROTTLE_MS = 60_000
let lastBurstAt = 0

interface FireOpts {
  particleCount?: number
  originX?: number
  originY?: number
  colors?: string[]
  shape?: 'square' | 'star'
  startVelocity?: number
  spread?: number
  gravity?: number
  scalar?: number
  ticks?: number
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rotation: number
): void {
  const points = 5
  const outer = size
  const inner = size * 0.45
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / points - Math.PI / 2 + rotation
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

function fireConfetti(opts: FireOpts = {}): void {
  const count = opts.particleCount ?? 160
  const colors = opts.colors ?? COLORS
  const shape = opts.shape ?? 'square'
  const spread = opts.spread ?? Math.PI * 1.6
  const startVel = opts.startVelocity ?? 9
  const gravity = opts.gravity ?? 0.25
  const scalar = opts.scalar ?? 1
  const maxTicks = opts.ticks ?? 220

  const w = window.innerWidth
  const h = window.innerHeight

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999'
  document.body.appendChild(canvas)
  console.log(
    '[confetti] canvas created —',
    { w: canvas.width, h: canvas.height, cssText: canvas.style.cssText, inDOM: document.contains(canvas) }
  )

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const originX = (opts.originX ?? 0.5) * w
  const originY = (opts.originY ?? 0.55) * h
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread
    const speed = startVel + Math.random() * (startVel * 0.9)
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      size: (7 + Math.random() * 5) * scalar,
      alpha: 1,
      kind: shape
    })
  }

  const DRAG = 0.992
  const started = performance.now()
  // Convert maxTicks @60fps to ms for the fade timer.
  const fadeAfterMs = (maxTicks / 60) * 1000 * 0.65

  function step(now: number): void {
    ctx!.clearRect(0, 0, w, h)
    const fading = now - started > fadeAfterMs
    let alive = 0
    for (const p of particles) {
      if (p.alpha <= 0) continue
      p.vy += gravity
      p.vx *= DRAG
      p.vy *= DRAG
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      if (fading) p.alpha = Math.max(0, p.alpha - 0.015)
      if (p.y > h + 40 || p.alpha <= 0) {
        p.alpha = 0
        continue
      }
      ctx!.save()
      ctx!.globalAlpha = p.alpha
      ctx!.fillStyle = p.color
      if (p.kind === 'star') {
        drawStar(ctx!, p.x, p.y, p.size * 0.9, p.rot)
      } else {
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rot)
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      }
      ctx!.restore()
      alive++
    }
    if (alive > 0) requestAnimationFrame(step)
    else canvas.remove()
  }
  requestAnimationFrame(step)
}

/** Fires a birthday-style burst. Throttled to once per 60 seconds globally.
 *  Pass any key — it's ignored by the throttle logic but useful for logs.
 *
 *  DEBUG: throttle temporarily bypassed so confetti fires on every render.
 *  Restore by uncommenting the throttle check block below. */
export function celebrateIfNewDay(key?: string): void {
  console.log(
    '[confetti] celebrateIfNewDay called — key=',
    key,
    ' msSinceLastBurst=',
    Date.now() - lastBurstAt
  )

  // THROTTLE BYPASSED FOR DEBUGGING. Restore by re-enabling the const
  // BURST_THROTTLE_MS at the top of the file and uncommenting this block:
  // const now = Date.now()
  // if (now - lastBurstAt < BURST_THROTTLE_MS) {
  //   console.log('[confetti] throttle HIT — skipping')
  //   return
  // }
  lastBurstAt = Date.now()

  if (!document.body) {
    console.error('[confetti] no document.body')
    return
  }
  console.log('[confetti] firing')
  fireConfetti({ particleCount: 180, originY: 0.55 })
  setTimeout(() => fireConfetti({ particleCount: 140, originY: 0.6 }), 250)
}

/** Manual trigger — bypasses the throttle. */
export function burstNow(): void {
  lastBurstAt = 0
  celebrateIfNewDay('manual-' + Date.now())
}

/**
 * Gold star burst for the Member-of-the-Month hero slide. Three sequential
 * bursts from left-center, top-center, right-center at 400ms intervals. NOT
 * throttled — fires every time it's called.
 */
export function fireStarBurst(): void {
  if (!document.body) return
  const common: FireOpts = {
    particleCount: 60,
    spread: Math.PI * 0.6,
    startVelocity: 12,
    gravity: 0.7,
    scalar: 1.6,
    ticks: 220,
    shape: 'star',
    colors: STAR_COLORS
  }
  fireConfetti({ ...common, originX: 0.12, originY: 0.55 })
  setTimeout(() => fireConfetti({ ...common, originX: 0.5, originY: 0.2 }), 400)
  setTimeout(() => fireConfetti({ ...common, originX: 0.88, originY: 0.55 }), 800)
}
