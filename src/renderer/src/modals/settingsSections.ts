// MOTM, Coach Rotation, Attendance, and QR Code Settings sections.
// Factored out of SettingsModal.ts so that file doesn't balloon.

import type {
  AttendanceRow,
  CelebEvent,
  CelebEventComputed,
  MotmMember,
  MotmQA,
  QRCodeEntry
} from '@shared/types'
import QRCode from 'qrcode'
import { parseAttendanceCsv } from '@utils/attendanceCsvParser'
import {
  currentMonthInTz,
  getRotationSchedule,
  nextMonth,
  previousMonth
} from '@utils/coachRotation'
import { formatDisplayDate } from '@utils/dateHelpers'
import { toast } from '../components/Toast'
import { fileUrl } from '../utils/fileUrl'
import { openEventForm } from './EventFormModal'
import { refreshEvents, subscribe } from '../state'
import { dropZone } from '../components/DropZone'

// ─── Section: MOTM Manager ─────────────────────────────────────────────────
export function motmSection(): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-4'

  const listWrap = document.createElement('div')
  listWrap.className = 'flex flex-col gap-2'
  body.appendChild(listWrap)

  async function refreshList(): Promise<void> {
    const members = await window.celebAPI.motm.getAll()
    listWrap.replaceChildren()
    if (members.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'text-xs opacity-60'
      empty.textContent = 'No members yet. Click "Add member" below.'
      listWrap.appendChild(empty)
      return
    }
    for (const m of members) {
      listWrap.appendChild(memberRow(m, refreshList))
    }
  }

  const actions = document.createElement('div')
  actions.className = 'flex gap-2 flex-wrap'

  const addBtn = document.createElement('button')
  addBtn.className = 'btn btn-primary'
  addBtn.textContent = '＋ Add member'
  addBtn.addEventListener('click', () => openMotmForm(null, refreshList))
  actions.appendChild(addBtn)

  const swapAllBtn = document.createElement('button')
  swapAllBtn.className = 'btn btn-ghost'
  swapAllBtn.textContent = '↕ Swap Q↔A for all members'
  swapAllBtn.title =
    'Use if your imported Q&A pairs are reversed everywhere — swaps question/answer for every pair of every member.'
  swapAllBtn.addEventListener('click', async () => {
    const all = await window.celebAPI.motm.getAll()
    const pairCount = all.reduce((n, m) => n + m.qa.length, 0)
    if (pairCount === 0) {
      toast('No Q&A pairs to swap.', 'info')
      return
    }
    if (
      !confirm(
        `Swap question↔answer for all ${pairCount} pair${pairCount === 1 ? '' : 's'} across ${all.length} member${all.length === 1 ? '' : 's'}?\n\nThis cannot be undone (but running it a second time returns you to the original).`
      )
    ) {
      return
    }
    for (const m of all) {
      await window.celebAPI.motm.upsert({
        ...m,
        qa: m.qa.map((p) => ({ question: p.answer, answer: p.question }))
      })
    }
    toast(`Swapped ${pairCount} pairs across ${all.length} members`, 'success')
    await refreshList()
  })
  actions.appendChild(swapAllBtn)

  const cleanPrefixesBtn = document.createElement('button')
  cleanPrefixesBtn.className = 'btn btn-ghost'
  cleanPrefixesBtn.textContent = '✂ Clean Q:/A: prefixes'
  cleanPrefixesBtn.title =
    'Strip any leading "Q:", "A:", "Question:", or "Answer:" from every stored pair. The display adds its own Q — / A — labels, so removing these avoids doubled-up prefixes.'
  cleanPrefixesBtn.addEventListener('click', async () => {
    const all = await window.celebAPI.motm.getAll()
    const prefixRe = /^\s*(?:q|a|question|answer)\s*[:.)\-–—]\s*/i
    let changed = 0
    for (const m of all) {
      const cleaned = m.qa.map((p) => ({
        question: (p.question ?? '').replace(prefixRe, '').trim(),
        answer: (p.answer ?? '').replace(prefixRe, '').trim()
      }))
      const anyDifferent = cleaned.some(
        (p, i) =>
          p.question !== m.qa[i]?.question || p.answer !== m.qa[i]?.answer
      )
      if (anyDifferent) {
        await window.celebAPI.motm.upsert({ ...m, qa: cleaned })
        changed++
      }
    }
    toast(
      changed === 0
        ? 'Nothing to clean — pairs were already tidy.'
        : `Cleaned Q:/A: prefixes in ${changed} member${changed === 1 ? '' : 's'}`,
      changed === 0 ? 'info' : 'success'
    )
    await refreshList()
  })
  actions.appendChild(cleanPrefixesBtn)

  body.appendChild(actions)
  void refreshList()
  return body
}

function memberRow(m: MotmMember, onChange: () => Promise<void>): HTMLElement {
  const row = document.createElement('div')
  row.className = 'surface p-3 flex items-center gap-3'

  const thumb = document.createElement('div')
  thumb.className = 'w-12 h-12 rounded-brand overflow-hidden bg-slate-700 flex-shrink-0'
  if (m.photo_url) {
    const img = document.createElement('img')
    img.src = fileUrl(m.photo_url)
    img.className = 'w-full h-full object-cover'
    thumb.appendChild(img)
  } else {
    thumb.textContent = '⭐'
    thumb.className += ' flex items-center justify-center text-xl'
  }
  row.appendChild(thumb)

  const body = document.createElement('div')
  body.className = 'flex-1 min-w-0'
  const name = document.createElement('div')
  name.className = 'font-semibold truncate flex items-center gap-2'
  const nameText = document.createElement('span')
  nameText.textContent = m.name
  name.appendChild(nameText)
  if (m.isActive) {
    const active = document.createElement('span')
    active.className = 'type-badge'
    active.style.background = 'rgba(56, 189, 248, 0.2)'
    active.style.color = 'var(--brand-primary)'
    active.textContent = `Active · ${m.activeMonth ?? ''}`
    name.appendChild(active)
  }
  body.appendChild(name)
  const meta = document.createElement('div')
  meta.className = 'text-xs opacity-60'
  meta.textContent = [m.title, `${m.qa.length} Q&A`].filter(Boolean).join(' · ')
  body.appendChild(meta)
  row.appendChild(body)

  const btns = document.createElement('div')
  btns.className = 'flex gap-1'

  const setActive = document.createElement('button')
  setActive.className = 'icon-btn'
  setActive.title = 'Set active for current month'
  setActive.textContent = '⭐'
  setActive.addEventListener('click', async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    await window.celebAPI.motm.setActive(m.id, currentMonthInTz(tz))
    toast('Set as active', 'success')
    await onChange()
  })

  const edit = document.createElement('button')
  edit.className = 'icon-btn'
  edit.title = 'Edit'
  edit.textContent = '✏'
  edit.addEventListener('click', () => openMotmForm(m, onChange))

  const del = document.createElement('button')
  del.className = 'icon-btn text-rose-500'
  del.title = 'Delete'
  del.textContent = '🗑'
  del.addEventListener('click', async () => {
    if (!confirm(`Delete "${m.name}"?`)) return
    await window.celebAPI.motm.delete(m.id)
    await onChange()
  })

  btns.appendChild(setActive)
  btns.appendChild(edit)
  btns.appendChild(del)
  row.appendChild(btns)
  return row
}

function openMotmForm(existing: MotmMember | null, onSaved: () => Promise<void>): void {
  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 fade-in'
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })

  const panel = document.createElement('div')
  panel.className = 'surface max-w-2xl w-full p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto'
  panel.addEventListener('click', (e) => e.stopPropagation())

  const title = document.createElement('h3')
  title.className = 'text-[18px] font-semibold'
  title.textContent = existing ? 'Edit member' : 'New member'
  panel.appendChild(title)

  const nameInput = labeledInput('Name*', existing?.name ?? '', 'text')
  const titleInput = labeledInput('Title (optional)', existing?.title ?? '', 'text')
  const sinceInput = labeledInput('Member since (YYYY-MM-DD)', existing?.startDate ?? '', 'date')
  // "Active for month" — drives the banner header text on the MOTM view.
  // Empty string means "not active". Picking a month here also implicitly
  // activates the member (sets isActive=true on save). Format is YYYY-MM
  // matching the <input type="month"> spec — same as activeMonth in the DB.
  const activeMonthInput = labeledInput(
    'Active for month (leave empty if not active)',
    existing?.activeMonth ?? '',
    'month'
  )
  panel.appendChild(nameInput.wrap)
  panel.appendChild(titleInput.wrap)
  panel.appendChild(sinceInput.wrap)
  panel.appendChild(activeMonthInput.wrap)

  // Photo
  let photoPath: string | undefined = existing?.photo_url
  const photoRow = document.createElement('div')
  photoRow.className = 'flex items-center gap-3'
  const photoThumb = document.createElement('div')
  photoThumb.className = 'w-16 h-16 rounded-brand overflow-hidden bg-slate-700 flex-shrink-0'
  const photoImg = document.createElement('img')
  photoImg.className = 'w-full h-full object-cover'
  if (photoPath) photoImg.src = fileUrl(photoPath)
  photoThumb.appendChild(photoImg)
  const photoBtn = document.createElement('button')
  photoBtn.type = 'button'
  photoBtn.className = 'btn btn-ghost'
  photoBtn.textContent = photoPath ? 'Replace photo…' : 'Choose photo…'
  photoBtn.addEventListener('click', async () => {
    const src = await window.celebAPI.system.openFilePicker([
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ])
    if (!src) return
    const saved = await window.celebAPI.motm.savePhoto(src)
    photoPath = saved
    photoImg.src = fileUrl(saved)
    photoBtn.textContent = 'Replace photo…'
  })
  photoRow.appendChild(photoThumb)
  photoRow.appendChild(photoBtn)
  panel.appendChild(photoRow)

  // Name style
  let nameStyle = existing?.nameStyle ?? 'diagonal'
  const styleWrap = document.createElement('div')
  styleWrap.className = 'flex flex-col gap-1'
  const styleLabel = document.createElement('span')
  styleLabel.className = 'text-sm opacity-70'
  styleLabel.textContent = 'Name style'
  styleWrap.appendChild(styleLabel)
  const styleRow = document.createElement('div')
  styleRow.className = 'flex gap-2'
  const styles: { id: 'vertical' | 'diagonal' | 'horizontal'; preview: string }[] = [
    { id: 'vertical', preview: 'F ⇅ L' },
    { id: 'diagonal', preview: 'F ⤢ L' },
    { id: 'horizontal', preview: 'F — L' }
  ]
  const styleBtns: HTMLButtonElement[] = []
  for (const s of styles) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn btn-ghost flex-1 flex-col items-center gap-0.5'
    b.innerHTML = `<span class="text-lg">${s.preview}</span><span class="text-xs opacity-70">${s.id}</span>`
    if (nameStyle === s.id) b.style.outline = '2px solid var(--brand-primary)'
    b.addEventListener('click', () => {
      nameStyle = s.id
      for (const sb of styleBtns) sb.style.outline = ''
      b.style.outline = '2px solid var(--brand-primary)'
    })
    styleBtns.push(b)
    styleRow.appendChild(b)
  }
  styleWrap.appendChild(styleRow)
  panel.appendChild(styleWrap)

  // Generate preview
  const previewWrap = document.createElement('div')
  previewWrap.className = 'flex flex-col gap-2'
  const previewBtn = document.createElement('button')
  previewBtn.type = 'button'
  previewBtn.className = 'btn btn-ghost self-start'
  previewBtn.textContent = 'Generate preview'
  const previewImg = document.createElement('img')
  previewImg.className = 'rounded-brand max-h-64 object-contain hidden'
  previewBtn.addEventListener('click', async () => {
    if (!photoPath) {
      toast('Choose a photo first', 'warning')
      return
    }
    const name = (nameInput.input as HTMLInputElement).value.trim()
    if (!name) {
      toast('Enter a name first', 'warning')
      return
    }
    const parts = name.split(/\s+/)
    const first = parts[0] ?? name
    const last = parts.slice(1).join(' ')
    previewBtn.disabled = true
    try {
      const out = await window.celebAPI.motm.generateOverlay({
        photoPath,
        firstName: first,
        lastName: last,
        nameStyle,
        outputPath: ''
      })
      previewImg.src = fileUrl(out) + '?t=' + Date.now()
      previewImg.classList.remove('hidden')
    } catch (err) {
      toast(`Preview failed: ${String(err)}`, 'error')
    } finally {
      previewBtn.disabled = false
    }
  })
  previewWrap.appendChild(previewBtn)
  previewWrap.appendChild(previewImg)
  panel.appendChild(previewWrap)

  // Q&A pairs
  const qaWrap = document.createElement('div')
  qaWrap.className = 'flex flex-col gap-2'
  const qaTitle = document.createElement('div')
  qaTitle.className = 'text-sm font-semibold opacity-70'
  qaTitle.textContent = 'Q&A pairs (max 20)'
  qaWrap.appendChild(qaTitle)
  const pairsBox = document.createElement('div')
  pairsBox.className = 'flex flex-col gap-2'
  qaWrap.appendChild(pairsBox)

  let pairs: MotmQA[] = existing ? structuredClone(existing.qa) : []
  const renderPairs = (): void => {
    pairsBox.replaceChildren()
    pairs.forEach((p, i) => pairsBox.appendChild(pairEditor(p, i, pairs, renderPairs)))
  }
  renderPairs()

  const qaActions = document.createElement('div')
  qaActions.className = 'flex gap-2 flex-wrap'
  const addPair = document.createElement('button')
  addPair.type = 'button'
  addPair.className = 'btn btn-ghost'
  addPair.textContent = '＋ Add pair'
  addPair.addEventListener('click', () => {
    if (pairs.length >= 20) {
      toast('Max 20 pairs', 'warning')
      return
    }
    pairs.push({ question: '', answer: '' })
    renderPairs()
  })

  const swapBtn = document.createElement('button')
  swapBtn.type = 'button'
  swapBtn.className = 'btn btn-ghost'
  swapBtn.textContent = '↕ Swap Q↔A'
  swapBtn.title = 'Swap question and answer for every pair — use if imported data is reversed'
  swapBtn.addEventListener('click', () => {
    if (pairs.length === 0) return
    if (!confirm(`Swap question and answer for all ${pairs.length} pairs?`)) return
    pairs = pairs.map((p) => ({ question: p.answer, answer: p.question }))
    renderPairs()
    toast('Swapped all Q↔A pairs', 'success')
  })
  const importDocx = document.createElement('button')
  importDocx.type = 'button'
  importDocx.className = 'btn btn-ghost'
  importDocx.textContent = 'Import from .docx'
  importDocx.addEventListener('click', async () => {
    const src = await window.celebAPI.system.openFilePicker([
      { name: 'Word', extensions: ['docx'] }
    ])
    if (!src) return
    try {
      const res = await window.celebAPI.motm.parseDocx(src)
      if (res.pairs.length === 0) {
        toast('No Q&A pairs detected in the document', 'warning')
        return
      }
      if (!confirm(`Detected ${res.pairs.length} pair(s) (confidence: ${res.confidence}). Replace current list?`)) {
        return
      }
      pairs = res.pairs
      renderPairs()
      toast(`Imported ${res.pairs.length} pairs`, 'success')
    } catch (err) {
      toast(`Parse failed: ${String(err)}`, 'error')
    }
  })
  const pasteText = document.createElement('button')
  pasteText.type = 'button'
  pasteText.className = 'btn btn-ghost'
  pasteText.textContent = 'Paste text'
  pasteText.addEventListener('click', async () => {
    const txt = prompt('Paste Q&A text (alternating or Q:/A: prefixed):')
    if (!txt) return
    const res = await window.celebAPI.motm.parsePastedText(txt)
    if (res.pairs.length === 0) {
      toast('No pairs detected', 'warning')
      return
    }
    pairs = res.pairs
    renderPairs()
    toast(`Parsed ${res.pairs.length} pairs`, 'success')
  })
  qaActions.appendChild(addPair)
  qaActions.appendChild(swapBtn)
  qaActions.appendChild(importDocx)
  qaActions.appendChild(pasteText)
  qaWrap.appendChild(qaActions)
  panel.appendChild(qaWrap)

  // Buttons
  const actions = document.createElement('div')
  actions.className = 'flex gap-2 justify-end'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'btn btn-ghost'
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', () => overlay.remove())
  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'btn btn-primary'
  save.textContent = 'Save'
  save.addEventListener('click', async () => {
    const name = (nameInput.input as HTMLInputElement).value.trim()
    // eslint-disable-next-line no-console
    console.log(
      '[motm-form] save clicked — name=',
      name,
      ' photoPath=',
      photoPath,
      ' pairs=',
      pairs.length
    )
    if (!name) {
      toast('Name is required', 'warning')
      return
    }
    if (pairs.length === 0) {
      toast('At least one Q&A pair is required', 'warning')
      return
    }
    // "Active for month" picker is the source of truth for both fields:
    // a value -> the member is active for that month; empty -> not active.
    // The DB upsertMotm handler already deactivates other members when
    // isActive=true is sent for a row (one active per month).
    const newActiveMonth = (activeMonthInput.input as HTMLInputElement).value.trim()
    try {
      const result = await window.celebAPI.motm.upsert({
        id: existing?.id,
        name,
        title: (titleInput.input as HTMLInputElement).value.trim() || undefined,
        startDate: (sinceInput.input as HTMLInputElement).value || undefined,
        photo_url: photoPath,
        nameStyle,
        qa: pairs,
        isActive: newActiveMonth.length > 0,
        activeMonth: newActiveMonth || undefined
      })
      // eslint-disable-next-line no-console
      console.log('[motm-form] upsert result:', result)
      toast(existing ? 'Updated' : 'Added', 'success')
      overlay.remove()
      await onSaved()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[motm-form] upsert FAILED:', err)
      toast(`Save failed: ${String(err)}`, 'error')
    }
  })
  actions.appendChild(cancel)
  actions.appendChild(save)
  panel.appendChild(actions)

  overlay.appendChild(panel)
  document.body.appendChild(overlay)
  setTimeout(() => (nameInput.input as HTMLInputElement).focus(), 0)
}

function pairEditor(
  pair: MotmQA,
  idx: number,
  pairs: MotmQA[],
  rerender: () => void
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'surface p-3 flex flex-col gap-2 relative'
  const header = document.createElement('div')
  header.className = 'flex items-center gap-2'
  const num = document.createElement('span')
  num.className = 'text-xs opacity-60'
  num.textContent = `#${idx + 1}`
  header.appendChild(num)
  const spacer = document.createElement('div')
  spacer.className = 'flex-1'
  header.appendChild(spacer)
  const up = document.createElement('button')
  up.type = 'button'
  up.className = 'icon-btn text-xs'
  up.textContent = '↑'
  up.addEventListener('click', () => {
    if (idx > 0) {
      ;[pairs[idx - 1], pairs[idx]] = [pairs[idx]!, pairs[idx - 1]!]
      rerender()
    }
  })
  const down = document.createElement('button')
  down.type = 'button'
  down.className = 'icon-btn text-xs'
  down.textContent = '↓'
  down.addEventListener('click', () => {
    if (idx < pairs.length - 1) {
      ;[pairs[idx + 1], pairs[idx]] = [pairs[idx]!, pairs[idx + 1]!]
      rerender()
    }
  })
  const swap = document.createElement('button')
  swap.type = 'button'
  swap.className = 'icon-btn text-xs'
  swap.title = 'Swap this Q and A'
  swap.textContent = '↕'
  swap.addEventListener('click', () => {
    const tmp = pair.question
    pair.question = pair.answer
    pair.answer = tmp
    rerender()
  })

  const del = document.createElement('button')
  del.type = 'button'
  del.className = 'icon-btn text-rose-500 text-xs'
  del.textContent = '✕'
  del.addEventListener('click', () => {
    pairs.splice(idx, 1)
    rerender()
  })
  header.appendChild(up)
  header.appendChild(down)
  header.appendChild(swap)
  header.appendChild(del)
  wrap.appendChild(header)

  const q = document.createElement('input')
  q.className =
    'w-full h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  q.placeholder = 'Question'
  q.value = pair.question
  q.addEventListener('input', () => {
    pair.question = q.value
  })
  wrap.appendChild(q)

  const aWrap = document.createElement('div')
  aWrap.className = 'relative'
  const a = document.createElement('textarea')
  a.className =
    'w-full p-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  a.rows = 3
  a.placeholder = 'Answer (max 500 chars)'
  a.maxLength = 500
  a.value = pair.answer
  const counter = document.createElement('div')
  counter.className = 'absolute bottom-1 right-2 text-xs opacity-50'
  const updateCounter = (): void => {
    counter.textContent = `${a.value.length} / 500`
  }
  a.addEventListener('input', () => {
    pair.answer = a.value
    updateCounter()
  })
  updateCounter()
  aWrap.appendChild(a)
  aWrap.appendChild(counter)
  wrap.appendChild(aWrap)

  return wrap
}

function labeledInput(
  label: string,
  value: string,
  type: string
): { wrap: HTMLElement; input: HTMLElement } {
  const wrap = document.createElement('label')
  wrap.className = 'flex flex-col gap-1 text-sm'
  const l = document.createElement('span')
  l.className = 'opacity-70'
  l.textContent = label
  const input = document.createElement('input')
  input.type = type
  input.value = value
  input.className =
    'w-full h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  wrap.appendChild(l)
  wrap.appendChild(input)
  return { wrap, input }
}

// ─── Section: Coach Rotation ───────────────────────────────────────────────
export function coachesSection(): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-3'

  const listWrap = document.createElement('div')
  listWrap.className = 'flex flex-col gap-2'
  body.appendChild(listWrap)

  const addWrap = document.createElement('div')
  addWrap.className = 'flex gap-2 items-center'
  const addInput = document.createElement('input')
  addInput.type = 'text'
  addInput.placeholder = 'Coach name'
  addInput.className =
    'flex-1 h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  const addBtn = document.createElement('button')
  addBtn.className = 'btn btn-primary'
  addBtn.textContent = 'Add'
  addBtn.addEventListener('click', async () => {
    const name = addInput.value.trim()
    if (!name) return
    await window.celebAPI.coaches.upsert({ name })
    addInput.value = ''
    await render()
  })
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click()
  })
  addWrap.appendChild(addInput)
  addWrap.appendChild(addBtn)
  body.appendChild(addWrap)

  const rotationWrap = document.createElement('div')
  rotationWrap.className = 'flex flex-col gap-1 mt-2'
  body.appendChild(rotationWrap)

  async function render(): Promise<void> {
    const coaches = await window.celebAPI.coaches.getAll()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const thisMonth = currentMonthInTz(tz)
    const next = nextMonth(thisMonth)

    listWrap.replaceChildren()
    if (coaches.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'text-xs opacity-60'
      empty.textContent = 'No coaches yet.'
      listWrap.appendChild(empty)
    } else {
      const schedule = getRotationSchedule(coaches, thisMonth, 1)
      const nextSchedule = getRotationSchedule(coaches, next, 1)
      const thisPicker = schedule[0]?.coach?.id
      const nextPicker = nextSchedule[0]?.coach?.id

      for (const c of coaches) {
        const row = document.createElement('div')
        row.className = 'surface p-2 flex items-center gap-2'
        const name = document.createElement('span')
        name.className = 'flex-1 truncate'
        name.textContent = c.name
        row.appendChild(name)
        if (c.id === thisPicker) {
          const b = document.createElement('span')
          b.className = 'type-badge'
          b.style.background = 'rgba(56, 189, 248, 0.2)'
          b.style.color = 'var(--brand-primary)'
          b.textContent = `🗓 ${new Date(thisMonth + '-01').toLocaleString('en-US', { month: 'long' })}'s pick`
          row.appendChild(b)
        } else if (c.id === nextPicker) {
          const b = document.createElement('span')
          b.className = 'type-badge opacity-60'
          b.textContent = 'upcoming'
          row.appendChild(b)
        }
        const del = document.createElement('button')
        del.className = 'icon-btn text-rose-500'
        del.textContent = '✕'
        del.addEventListener('click', async () => {
          if (!confirm(`Remove ${c.name}?`)) return
          await window.celebAPI.coaches.delete(c.id)
          await render()
        })
        row.appendChild(del)
        listWrap.appendChild(row)
      }
    }

    // Rotation schedule (next 12 months)
    rotationWrap.replaceChildren()
    if (coaches.length > 0) {
      const tbl = document.createElement('details')
      const sum = document.createElement('summary')
      sum.className = 'cursor-pointer text-sm opacity-80'
      sum.textContent = '12-month schedule'
      tbl.appendChild(sum)
      const list = document.createElement('div')
      list.className = 'mt-2 flex flex-col gap-1 text-sm'
      const schedule = getRotationSchedule(coaches, thisMonth, 12)
      for (const s of schedule) {
        const r = document.createElement('div')
        r.className = 'flex justify-between border-b border-slate-400/10 py-1'
        const m = document.createElement('span')
        m.className = 'opacity-70'
        const [y, mo] = s.month.split('-').map(Number) as [number, number]
        m.textContent = new Date(y, mo - 1, 1).toLocaleString('en-US', {
          month: 'long',
          year: 'numeric'
        })
        const c = document.createElement('span')
        c.className = 'font-medium'
        c.textContent = s.coach?.name ?? '—'
        r.appendChild(m)
        r.appendChild(c)
        list.appendChild(r)
      }
      tbl.appendChild(list)
      rotationWrap.appendChild(tbl)
    }
  }

  void render()
  return body
}

// ─── Section: Attendance Import ─────────────────────────────────────────────
export function attendanceSection(): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-3'

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const monthInput = document.createElement('input')
  monthInput.type = 'month'
  // Default to the previous month — ChalkItPro attendance data is typically
  // for the just-completed month, not the one in progress.
  monthInput.value = previousMonth(currentMonthInTz(tz))
  monthInput.className =
    'h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  const monthLabel = document.createElement('label')
  monthLabel.className = 'flex flex-col gap-1 text-sm'
  const ml = document.createElement('span')
  ml.className = 'opacity-70'
  // Renamed in v1.1.2 to disambiguate from the AttendanceView's display-
  // month dropdown — this picker only controls which month CSV rows get
  // labeled as on import. The view's display month is independent and
  // lives in `attendanceViewMonth` setting.
  ml.textContent = 'Import as month'
  const sub = document.createElement('span')
  sub.className = 'text-xs opacity-50'
  sub.textContent = 'CSV rows will be labeled as this month. Defaults to previous month (ChalkItPro runs a month behind).'
  monthLabel.appendChild(ml)
  monthLabel.appendChild(monthInput)
  monthLabel.appendChild(sub)
  body.appendChild(monthLabel)

  // Shared handler used by both the drop zone and the explicit button.
  const importAttendance = async (path: string): Promise<void> => {
    try {
      const txt = await window.celebAPI.system.readTextFile(path)
      const parsed = parseAttendanceCsv(txt)
      if (parsed.rows.length === 0) {
        const msg = parsed.errors[0]?.message ?? 'No rows parsed.'
        alert(msg)
        return
      }
      const preview = previewAttendance(parsed.rows)
      const ok = confirm(
        `Import ${parsed.rows.length} rows into ${monthInput.value}?\n\n` +
          `${preview}\n\nThis will update existing rows for the same name + month.`
      )
      if (!ok) return
      const res = await window.celebAPI.attendance.bulkUpsert(parsed.rows, monthInput.value)
      toast(
        `Imported ${res.inserted} new, ${res.updated} updated for ${monthInput.value}`,
        'success'
      )
    } catch (err) {
      toast(`Import failed: ${String(err)}`, 'error')
    }
  }

  body.appendChild(
    dropZone({
      label: 'Drop Attendance CSV here or click to browse',
      extensions: ['csv', 'tsv', 'txt'],
      onFile: importAttendance
    })
  )

  const clearBtn = document.createElement('button')
  clearBtn.className = 'btn btn-ghost text-rose-500 self-start'
  clearBtn.textContent = 'Clear selected month'
  clearBtn.addEventListener('click', async () => {
    if (!confirm(`Clear all attendance rows for ${monthInput.value}?`)) return
    const n = await window.celebAPI.attendance.clearMonth(monthInput.value)
    toast(`Cleared ${n} rows`, 'success')
  })
  body.appendChild(clearBtn)

  return body
}

function previewAttendance(
  rows: { firstName: string; lastName: string; count: number }[]
): string {
  const committed = rows.filter((r) => r.count >= 20).length
  const consistent = rows.filter((r) => r.count >= 12 && r.count < 20).length
  const other = rows.length - committed - consistent
  return `🏆 Committed (20+): ${committed}\n💪 Consistent (12–19): ${consistent}\n· Other (<12): ${other}`
}

// ─── Section: QR Codes ────────────────────────────────────────────────────
export function qrCodesSection(): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-3'

  const listWrap = document.createElement('div')
  listWrap.className = 'flex flex-col gap-3'
  body.appendChild(listWrap)

  let codes: QRCodeEntry[] = []
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const save = async (): Promise<void> => {
    await window.celebAPI.settings.set('qrCodes', codes)
  }

  function render(): void {
    listWrap.replaceChildren()
    codes.forEach((c) => listWrap.appendChild(editor(c)))
  }

  function editor(entry: QRCodeEntry): HTMLElement {
    const row = document.createElement('div')
    row.className = 'surface p-3 grid grid-cols-[96px_1fr] gap-3 items-center'

    const preview = document.createElement('canvas')
    preview.width = 96
    preview.height = 96
    preview.style.background = '#fff'
    preview.style.borderRadius = 'var(--brand-radius)'
    const regen = async (): Promise<void> => {
      try {
        await QRCode.toCanvas(preview, entry.url || ' ', {
          margin: 1,
          width: 96,
          color: { dark: '#111', light: '#fff' }
        })
      } catch {
        /* ignore */
      }
    }
    void regen()
    row.appendChild(preview)

    const right = document.createElement('div')
    right.className = 'flex flex-col gap-2'

    const topRow = document.createElement('div')
    topRow.className = 'flex gap-2'
    const iconIn = document.createElement('input')
    iconIn.type = 'text'
    iconIn.value = entry.icon
    iconIn.maxLength = 4
    iconIn.placeholder = '🔗'
    iconIn.className =
      'w-16 h-10 px-2 rounded-brand border border-slate-400/30 bg-transparent text-center'
    iconIn.addEventListener('input', () => {
      entry.icon = iconIn.value
      void save()
    })
    const labelIn = document.createElement('input')
    labelIn.type = 'text'
    labelIn.value = entry.label
    labelIn.placeholder = 'Label'
    labelIn.className =
      'flex-1 h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent'
    labelIn.addEventListener('input', () => {
      entry.label = labelIn.value
      void save()
    })
    topRow.appendChild(iconIn)
    topRow.appendChild(labelIn)
    right.appendChild(topRow)

    const urlIn = document.createElement('input')
    urlIn.type = 'url'
    urlIn.value = entry.url
    urlIn.placeholder = 'https://…'
    urlIn.className = 'h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent'
    urlIn.addEventListener('input', () => {
      entry.url = urlIn.value
      const existing = debounceTimers.get(entry.id)
      if (existing) clearTimeout(existing)
      debounceTimers.set(
        entry.id,
        setTimeout(() => {
          void regen()
          void save()
        }, 500)
      )
    })
    right.appendChild(urlIn)

    const toggleWrap = document.createElement('label')
    toggleWrap.className = 'flex items-center gap-2 text-xs opacity-80'
    const toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.checked = entry.includeInSlideshow
    toggle.addEventListener('change', () => {
      entry.includeInSlideshow = toggle.checked
      void save()
    })
    const toggleLabel = document.createElement('span')
    toggleLabel.textContent = 'Include in slideshow rotation'
    toggleWrap.appendChild(toggle)
    toggleWrap.appendChild(toggleLabel)
    right.appendChild(toggleWrap)

    row.appendChild(right)
    return row
  }

  void window.celebAPI.settings.get('qrCodes').then((raw) => {
    codes = Array.isArray(raw) ? (raw as QRCodeEntry[]) : []
    render()
  })

  return body
}

// Import AttendanceRow so TypeScript doesn't drop the type.
export type { AttendanceRow }

// ─── Section: Events Manager (for the Events view) ────────────────────────
/** Lists all events of type 'event' or 'custom' with inline edit + delete,
 *  plus a "+ New event" button that opens the standard form pre-filled for
 *  type=event. These are the rows that appear on the 📅 Events tab. */
export function eventsSection(): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-3'

  const listWrap = document.createElement('div')
  listWrap.className = 'flex flex-col gap-2'
  body.appendChild(listWrap)

  async function refreshList(): Promise<void> {
    const all = await window.celebAPI.db.getAll()
    const events = (all as CelebEventComputed[])
      .filter((e) => e.type === 'event' || e.type === 'custom')
      .sort((a, b) => a.date.localeCompare(b.date))
    listWrap.replaceChildren()
    if (events.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'text-xs opacity-60'
      empty.textContent =
        'No events yet. Click "+ New event" below. Birthdays and anniversaries are managed via CSV import or clicking their cards in the Today/Week/Month views.'
      listWrap.appendChild(empty)
      return
    }
    for (const ev of events) {
      listWrap.appendChild(eventRow(ev, refreshList))
    }
  }

  const actions = document.createElement('div')
  actions.className = 'flex gap-2 flex-wrap'
  const addBtn = document.createElement('button')
  addBtn.className = 'btn btn-primary'
  addBtn.textContent = '＋ New event'
  addBtn.addEventListener('click', () => {
    // Seed a blank event object that EventFormModal accepts as "existing"-null.
    // We pass null so the form opens in "create" mode; the form defaults
    // type to 'birthday'. Change it to 'event' via the dropdown before saving.
    openEventForm(null)
  })
  actions.appendChild(addBtn)

  const hint = document.createElement('span')
  hint.className = 'text-xs opacity-60 self-center'
  hint.textContent = '← remember to set Type to "event" and fill in URL + location'
  actions.appendChild(hint)

  body.appendChild(actions)

  // Re-run refresh when the global events list changes (e.g. after save/delete).
  subscribe(() => {
    void refreshList()
  })
  void refreshList()

  return body
}

function eventRow(
  ev: CelebEventComputed,
  onChange: () => Promise<void>
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'surface p-3 flex items-center gap-3'

  // Thumb: photo if any, else a type glyph.
  const thumb = document.createElement('div')
  thumb.className =
    'w-14 h-14 rounded-brand overflow-hidden bg-slate-700 flex-shrink-0 flex items-center justify-center text-2xl'
  if (ev.photo_url) {
    const img = document.createElement('img')
    img.src = fileUrl(ev.photo_url)
    img.className = 'w-full h-full object-cover'
    thumb.appendChild(img)
  } else {
    thumb.textContent = ev.type === 'event' ? '📅' : '✨'
  }
  row.appendChild(thumb)

  const bodyCol = document.createElement('div')
  bodyCol.className = 'flex-1 min-w-0'

  const nameLine = document.createElement('div')
  nameLine.className = 'font-semibold flex items-center gap-2 flex-wrap'
  const name = document.createElement('span')
  name.className = 'truncate'
  name.textContent = ev.name
  nameLine.appendChild(name)
  const typeBadge = document.createElement('span')
  typeBadge.className = 'type-badge'
  typeBadge.style.fontSize = '11px'
  typeBadge.textContent = ev.type
  nameLine.appendChild(typeBadge)
  if (ev.event_url) {
    const qrBadge = document.createElement('span')
    qrBadge.className = 'type-badge'
    qrBadge.style.fontSize = '11px'
    qrBadge.style.color = 'var(--brand-primary)'
    qrBadge.style.borderColor = 'var(--brand-primary)'
    qrBadge.textContent = '📱 QR'
    nameLine.appendChild(qrBadge)
  }
  bodyCol.appendChild(nameLine)

  const meta = document.createElement('div')
  meta.className = 'text-xs opacity-70 mt-0.5 flex gap-3 flex-wrap'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const when = ev.end_date
    ? `${formatDisplayDate(ev.date, tz)} – ${formatDisplayDate(ev.end_date, tz)}`
    : formatDisplayDate(ev.date, tz)
  const whenSpan = document.createElement('span')
  whenSpan.textContent = `📅 ${when}`
  meta.appendChild(whenSpan)
  if (ev.location) {
    const loc = document.createElement('span')
    loc.textContent = `📍 ${ev.location}`
    meta.appendChild(loc)
  }
  const daysSpan = document.createElement('span')
  daysSpan.textContent =
    ev.daysUntil === 0 ? 'Today' : ev.daysUntil === 1 ? 'Tomorrow' : `in ${ev.daysUntil} days`
  daysSpan.className = ev.daysUntil < 0 ? 'text-slate-500' : ''
  meta.appendChild(daysSpan)
  bodyCol.appendChild(meta)

  if (ev.notes) {
    const notes = document.createElement('div')
    notes.className = 'text-xs opacity-50 mt-0.5 truncate'
    notes.textContent = ev.notes
    bodyCol.appendChild(notes)
  }

  row.appendChild(bodyCol)

  const btns = document.createElement('div')
  btns.className = 'flex gap-1 flex-shrink-0'

  const edit = document.createElement('button')
  edit.className = 'icon-btn'
  edit.title = 'Edit'
  edit.textContent = '✏'
  edit.addEventListener('click', () => openEventForm(ev))

  const del = document.createElement('button')
  del.className = 'icon-btn text-rose-500'
  del.title = 'Delete'
  del.textContent = '🗑'
  del.addEventListener('click', async () => {
    if (!confirm(`Delete "${ev.name}"?`)) return
    await window.celebAPI.db.delete(ev.id)
    await refreshEvents()
    await onChange()
    toast('Event deleted', 'success')
  })

  btns.appendChild(edit)
  btns.appendChild(del)
  row.appendChild(btns)

  return row
}

// ─── Section: Sync to gym TVs ──────────────────────────────────────────────
//
// Mac-only writer UI. Toggles the writer side of the sync pipeline: every
// save debounces a snapshot push to a Drive folder which the mini PCs poll.
// On Windows this section renders a short note explaining that the
// follower is configured via PowerShell scheduled task (out-of-band).
//
// Status updates flow in via the 'sync-status' IPC push channel.

export function syncSection(): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-3'

  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toLowerCase().includes('mac')

  if (!isMac) {
    const note = document.createElement('div')
    note.className = 'text-xs opacity-70 leading-relaxed'
    note.innerHTML =
      'This machine receives content from a Mac via the sync watcher ' +
      '(installed by <code>setup.ps1</code>). Edits made here will be ' +
      'overwritten the next time the Mac pushes a snapshot. To make ' +
      'content changes, edit on the Mac.'
    body.appendChild(note)
    return body
  }

  // Status line — refreshed on every 'sync-status' push.
  const statusLine = document.createElement('div')
  statusLine.className = 'text-xs opacity-70 leading-relaxed'
  statusLine.textContent = 'Loading sync status…'
  body.appendChild(statusLine)

  type SyncStatusUI =
    | { kind: 'disabled' }
    | { kind: 'idle'; folder: string; lastSnapshot: { timestamp: number; sha256: string } | null }
    | { kind: 'pending' }
    | { kind: 'syncing' }
    | { kind: 'error'; message: string }

  const renderStatus = (status: SyncStatusUI): void => {
    let text = ''
    switch (status.kind) {
      case 'disabled':
        text = 'Sync is off. Turn it on to push your edits to the gym TVs.'
        break
      case 'idle': {
        const when = status.lastSnapshot
          ? new Date(status.lastSnapshot.timestamp).toLocaleString()
          : 'never'
        text = `Ready. Last push: ${when}.`
        break
      }
      case 'pending':
        text = 'Edits detected — pushing in ~5 seconds…'
        break
      case 'syncing':
        text = 'Pushing to Drive now…'
        break
      case 'error':
        text = `Sync error: ${status.message}`
        break
    }
    statusLine.textContent = text
    statusLine.style.color = status.kind === 'error' ? '#dc2626' : ''
  }

  // Toggle row
  const toggleRow = document.createElement('label')
  toggleRow.className = 'flex items-center gap-2 cursor-pointer'
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  const toggleLabel = document.createElement('span')
  toggleLabel.className = 'text-sm'
  toggleLabel.textContent = 'Auto-sync to gym TVs on every save'
  toggleRow.appendChild(toggle)
  toggleRow.appendChild(toggleLabel)
  body.appendChild(toggleRow)

  // Manual button row
  const actions = document.createElement('div')
  actions.className = 'flex flex-wrap items-center gap-2'
  const syncNowBtn = document.createElement('button')
  syncNowBtn.className = 'btn btn-primary'
  syncNowBtn.textContent = 'Sync now'
  syncNowBtn.addEventListener('click', async () => {
    syncNowBtn.disabled = true
    syncNowBtn.textContent = 'Syncing…'
    const result = await window.celebAPI.sync.syncNow()
    syncNowBtn.disabled = false
    syncNowBtn.textContent = 'Sync now'
    if (!result.ok) toast(result.error ?? 'Sync failed', 'warning')
    else toast('Synced to gym TVs', 'success')
  })
  actions.appendChild(syncNowBtn)
  body.appendChild(actions)

  // Helper text
  const help = document.createElement('div')
  help.className = 'text-xs opacity-60 leading-relaxed'
  help.innerHTML =
    'When auto-sync is on, every save (event, MOTM, attendance, photo, ' +
    'settings) pushes a snapshot to your <code>CelebrateDesk Sync</code> ' +
    'folder in Google Drive. Each gym TV checks Drive every minute and ' +
    'auto-restores the latest snapshot. Round-trip is typically ' +
    '60–90 seconds.'
  body.appendChild(help)

  // Wire toggle
  toggle.addEventListener('change', async () => {
    toggle.disabled = true
    const result = await window.celebAPI.sync.setEnabled(toggle.checked)
    toggle.disabled = false
    if (!result.ok) {
      toggle.checked = !toggle.checked
      toast(result.error ?? 'Could not change sync state', 'warning')
    }
  })

  // Initial state + subscribe to push updates
  void (async (): Promise<void> => {
    const status = (await window.celebAPI.sync.getStatus()) as SyncStatusUI
    toggle.checked = status.kind !== 'disabled' && status.kind !== 'error'
    renderStatus(status)
    syncNowBtn.disabled = status.kind === 'disabled' || status.kind === 'syncing'
  })()

  window.celebAPI.on('sync-status', (payload: unknown) => {
    const status = payload as SyncStatusUI
    renderStatus(status)
    if (status.kind === 'disabled') toggle.checked = false
    syncNowBtn.disabled = status.kind === 'disabled' || status.kind === 'syncing'
  })

  return body
}

// Keep CelebEvent re-exported so downstream imports resolve.
export type { CelebEvent }
