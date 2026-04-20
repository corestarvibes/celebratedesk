// Parse MOTM Q&A pairs from a .docx. Main-process only (uses mammoth).
//
// Heuristic order (falls through on failure):
//   1. Bold runs = question, following normal runs = answer
//   2. Lines starting with "Q:" / "Question:" → question; "A:" / "Answer:" → answer
//   3. Alternating lines fallback

import mammoth from 'mammoth'
import type { MotmQA, ParsedDocxResult } from '@shared/types'

const Q_PREFIX = /^\s*(?:q|question)\s*[:.)\-]\s*/i
const A_PREFIX = /^\s*(?:a|answer)\s*[:.)\-]\s*/i

function tryBoldHtml(html: string): MotmQA[] | null {
  // Parse a tolerant subset: <strong>, <b>. Use a simple regex scanner.
  // Walks the HTML for "<strong>...</strong>" or "<b>...</b>" runs; everything
  // between the end of one bold run and the start of the next is its answer.
  const tagRe = /<(strong|b)>([\s\S]*?)<\/\1>/gi
  const matches: { index: number; end: number; text: string }[] = []
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html))) {
    const text = m[2]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) matches.push({ index: m.index, end: m.index + m[0].length, text })
  }
  if (matches.length < 2) return null

  const pairs: MotmQA[] = []
  for (let i = 0; i < matches.length; i++) {
    const q = matches[i]!
    const nextStart = i + 1 < matches.length ? matches[i + 1]!.index : html.length
    const between = html.slice(q.end, nextStart)
    const answer = between.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (answer) pairs.push({ question: q.text, answer })
  }
  return pairs.length >= 2 ? pairs : null
}

function tryPrefixedLines(lines: string[]): MotmQA[] | null {
  const pairs: MotmQA[] = []
  let pendingQ: string | null = null
  let pendingA: string | null = null
  const flush = (): void => {
    if (pendingQ && pendingA) {
      pairs.push({ question: pendingQ.trim(), answer: pendingA.trim() })
    }
    pendingQ = null
    pendingA = null
  }
  for (const line of lines) {
    if (Q_PREFIX.test(line)) {
      flush()
      pendingQ = line.replace(Q_PREFIX, '')
    } else if (A_PREFIX.test(line)) {
      pendingA = line.replace(A_PREFIX, '')
      if (pendingQ) flush()
    } else if (pendingQ && !pendingA) {
      // continuation of the question
      pendingQ += ' ' + line
    } else if (pendingA) {
      // continuation of the answer
      pendingA += ' ' + line
    }
  }
  flush()
  return pairs.length >= 2 ? pairs : null
}

function tryAlternating(lines: string[]): MotmQA[] | null {
  const pairs: MotmQA[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const q = lines[i]!.trim()
    const a = lines[i + 1]!.trim()
    if (q && a) pairs.push({ question: q, answer: a })
  }
  return pairs.length >= 2 ? pairs : null
}

export async function parseDocx(filePath: string): Promise<ParsedDocxResult> {
  const { value: html } = await mammoth.convertToHtml({ path: filePath })
  const { value: rawText } = await mammoth.extractRawText({ path: filePath })
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const boldPairs = tryBoldHtml(html)
  if (boldPairs) {
    return { pairs: boldPairs, rawText, confidence: 'high' }
  }
  const prefixedPairs = tryPrefixedLines(lines)
  if (prefixedPairs) {
    return { pairs: prefixedPairs, rawText, confidence: 'high' }
  }
  const altPairs = tryAlternating(lines)
  if (altPairs) {
    return { pairs: altPairs, rawText, confidence: 'low' }
  }
  return { pairs: [], rawText, confidence: 'low' }
}

/** Same heuristics against a plain string pasted by the user (no mammoth step). */
export function parsePastedText(text: string): ParsedDocxResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const prefixedPairs = tryPrefixedLines(lines)
  if (prefixedPairs) return { pairs: prefixedPairs, rawText: text, confidence: 'high' }
  const altPairs = tryAlternating(lines)
  if (altPairs) return { pairs: altPairs, rawText: text, confidence: 'low' }
  return { pairs: [], rawText: text, confidence: 'low' }
}
