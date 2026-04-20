// SVG name overlays composited onto a photo using sharp. Main-process only.
// Three styles: vertical, diagonal, horizontal — see each builder below.

import sharp from 'sharp'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { OverlayParams } from '@shared/types'

const DEFAULT_FONT = 'Arial Black, Arial, Helvetica, sans-serif'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function ensureDir(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ─── Vertical ─────────────────────────────────────────────────────────────
function buildVerticalSvg(width: number, height: number, first: string, last: string): string {
  const fontSize = Math.round(height * 0.11)
  const lineH = fontSize * 0.9
  const letters = (word: string, xPct: number): string => {
    const x = width * xPct
    const totalH = (word.length - 1) * lineH
    const startY = (height - totalH) / 2
    return word
      .toUpperCase()
      .split('')
      .map((ch, i) => {
        const y = startY + i * lineH + fontSize * 0.35
        const esc = escapeXml(ch)
        return `
          <text x="${x + 2}" y="${y + 2}" font-family="${DEFAULT_FONT}" font-size="${fontSize}"
                font-weight="900" text-anchor="middle" fill="#222">${esc}</text>
          <text x="${x}" y="${y}" font-family="${DEFAULT_FONT}" font-size="${fontSize}"
                font-weight="900" text-anchor="middle" fill="#ffffff">${esc}</text>`
      })
      .join('\n')
  }
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${letters(first, 0.15)}
      ${letters(last, 0.85)}
    </svg>`
}

// ─── Diagonal (default) ──────────────────────────────────────────────────
function buildDiagonalSvg(width: number, height: number, first: string, last: string): string {
  const fontSize = Math.round(height * 0.15)
  const fFirst = escapeXml(first.toUpperCase())
  const fLast = escapeXml(last.toUpperCase())
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width * 0.04}" y="${fontSize * 1.05}"
            font-family="${DEFAULT_FONT}" font-size="${fontSize}" font-weight="900"
            font-style="italic" fill="#ffffff" stroke="#222222" stroke-width="3"
            paint-order="stroke fill">${fFirst}</text>
      <text x="${width * 0.96}" y="${height - fontSize * 0.2}"
            font-family="${DEFAULT_FONT}" font-size="${fontSize}" font-weight="900"
            font-style="italic" fill="#ffffff" stroke="#222222" stroke-width="3"
            paint-order="stroke fill" text-anchor="end">${fLast}</text>
    </svg>`
}

// ─── Horizontal ──────────────────────────────────────────────────────────
function buildHorizontalSvg(width: number, height: number, first: string, last: string): string {
  const full = `${first} ${last}`.toUpperCase()
  // Approximate: font size such that rendered width fits ~90% of image width.
  // Rough heuristic: average character width ≈ 0.6 * font size for bold.
  const estimated = Math.round((width * 0.9) / (full.length * 0.55))
  const fontSize = Math.min(Math.round(height * 0.18), estimated)
  const y = Math.round(height * 0.08) + fontSize
  const safe = escapeXml(full)
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width / 2}" y="${y}"
            font-family="${DEFAULT_FONT}" font-size="${fontSize}" font-weight="900"
            fill="#ffffff" stroke="#222222" stroke-width="3" paint-order="stroke fill"
            text-anchor="middle">${safe}</text>
    </svg>`
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

/**
 * Composite the chosen name overlay onto `photoPath`, write to `outputPath` as
 * high-quality JPEG. Upscales to at least 2400×3000 for print readiness.
 */
export async function generateNameOverlay(params: OverlayParams): Promise<string> {
  const { photoPath, firstName, lastName, nameStyle, outputPath } = params
  ensureDir(outputPath)

  const image = sharp(photoPath).rotate() // honor EXIF orientation
  const meta = await image.metadata()
  const inW = meta.width ?? 1200
  const inH = meta.height ?? 1600

  // Upscale so either dimension meets print size 2400x3000 minimum.
  const targetMinW = 2400
  const targetMinH = 3000
  let targetW = inW
  let targetH = inH
  if (inW < targetMinW || inH < targetMinH) {
    const scale = Math.max(targetMinW / inW, targetMinH / inH)
    targetW = Math.round(inW * scale)
    targetH = Math.round(inH * scale)
  }

  const resized = await image
    .resize({ width: targetW, height: targetH, fit: 'cover' })
    .jpeg({ quality: 92 })
    .toBuffer()

  let svg: string
  switch (nameStyle) {
    case 'vertical':
      svg = buildVerticalSvg(targetW, targetH, firstName, lastName)
      break
    case 'horizontal':
      svg = buildHorizontalSvg(targetW, targetH, firstName, lastName)
      break
    case 'diagonal':
    default:
      svg = buildDiagonalSvg(targetW, targetH, firstName, lastName)
      break
  }

  await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath)

  return outputPath
}

export function splitFullName(fullName: string): { first: string; last: string } {
  return splitName(fullName)
}
