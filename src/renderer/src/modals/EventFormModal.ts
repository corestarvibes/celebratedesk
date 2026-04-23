import type { CelebEvent, CelebEventComputed, EventType } from '@shared/types'
import { refreshEvents } from '../state'
import { toast } from '../components/Toast'
import { fileUrl } from '../utils/fileUrl'

let currentEl: HTMLElement | null = null

function closeModal(): void {
  if (currentEl) {
    currentEl.remove()
    currentEl = null
  }
}

export function openEventForm(existing: CelebEventComputed | null): void {
  closeModal()

  const overlay = document.createElement('div')
  overlay.className =
    'fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4 fade-in'
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal()
  })

  const panel = document.createElement('div')
  panel.className = 'surface max-w-md w-full p-5 flex flex-col gap-3'
  panel.addEventListener('click', (e) => e.stopPropagation())

  const title = document.createElement('h2')
  title.className = 'text-[18px] font-semibold'
  title.textContent = existing ? 'Edit event' : 'New event'
  panel.appendChild(title)

  const form = document.createElement('form')
  form.className = 'flex flex-col gap-3'

  const nameInput = field('Name', 'text', existing?.name ?? '')
  const typeSelect = selectField('Type', ['birthday', 'anniversary', 'event', 'custom'], existing?.type ?? 'birthday')
  const dateInput = field('Date (YYYY-MM-DD)', 'date', existing?.date ?? '')
  const recurringWrap = document.createElement('label')
  recurringWrap.className = 'flex items-center gap-2 text-sm'
  const recurring = document.createElement('input')
  recurring.type = 'checkbox'
  recurring.checked = existing?.recurring ?? true
  recurringWrap.appendChild(recurring)
  const recLabel = document.createElement('span')
  recLabel.textContent = 'Recurs yearly'
  recurringWrap.appendChild(recLabel)

  const notesInput = textareaField('Notes / details', existing?.notes ?? '')

  // Photo picker — same UX as the Member-of-the-Month form. `photoPath` holds
  // the current value (absolute local path OR https:// URL); the picker
  // updates it in place, the URL fallback lets power-users type a remote URL.
  let photoPath: string | undefined = existing?.photo_url
  const photoBlock = buildPhotoPicker({
    initial: photoPath,
    onChange: (next): void => {
      photoPath = next
    }
  })

  // Extra fields used by the Events view. Shown for every type but most
  // useful when type = 'event' / 'custom'.
  const endDateInput = field(
    'End date (optional, for multi-day events)',
    'date',
    existing?.end_date ?? ''
  )
  const locationInput = field(
    'Location (optional)',
    'text',
    existing?.location ?? ''
  )
  const eventUrlInput = field(
    'Event URL — rendered as QR code on Events view (optional)',
    'text',
    existing?.event_url ?? ''
  )

  form.appendChild(nameInput.wrap)
  form.appendChild(typeSelect.wrap)
  form.appendChild(dateInput.wrap)
  form.appendChild(endDateInput.wrap)
  form.appendChild(recurringWrap)
  form.appendChild(locationInput.wrap)
  form.appendChild(notesInput.wrap)
  form.appendChild(photoBlock.wrap)
  form.appendChild(eventUrlInput.wrap)

  const err = document.createElement('div')
  err.className = 'text-xs text-rose-500 hidden'
  form.appendChild(err)

  const actions = document.createElement('div')
  actions.className = 'flex gap-2 justify-end mt-2'
  if (existing) {
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'btn btn-ghost text-rose-500 mr-auto'
    del.textContent = 'Delete'
    del.addEventListener('click', async () => {
      if (!existing) return
      if (!confirm(`Delete "${existing.name}"?`)) return
      await window.celebAPI.db.delete(existing.id)
      await refreshEvents()
      toast('Deleted', 'success')
      closeModal()
    })
    actions.appendChild(del)
  }
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'btn btn-ghost'
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', closeModal)
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'btn btn-primary'
  save.textContent = 'Save'
  actions.appendChild(cancel)
  actions.appendChild(save)
  form.appendChild(actions)
  panel.appendChild(form)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = (nameInput.input as HTMLInputElement).value.trim()
    const date = (dateInput.input as HTMLInputElement).value.trim()
    if (!name) return showErr(err, 'Name is required.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return showErr(err, 'Date must be YYYY-MM-DD (use the date picker).')

    const payload: Partial<CelebEvent> = {
      id: existing?.id,
      name,
      type: (typeSelect.input as HTMLSelectElement).value as EventType,
      date,
      recurring: recurring.checked,
      notes: (notesInput.input as HTMLTextAreaElement).value.trim() || undefined,
      photo_url: photoPath?.trim() || undefined,
      end_date: (endDateInput.input as HTMLInputElement).value.trim() || undefined,
      location: (locationInput.input as HTMLInputElement).value.trim() || undefined,
      event_url: (eventUrlInput.input as HTMLInputElement).value.trim() || undefined,
      source: existing?.source ?? 'manual'
    }
    try {
      await window.celebAPI.db.upsert(payload)
      await refreshEvents()
      toast(existing ? 'Updated' : 'Added', 'success')
      closeModal()
    } catch (e2) {
      showErr(err, String(e2))
    }
  })

  overlay.appendChild(panel)
  document.body.appendChild(overlay)
  currentEl = overlay
  setTimeout(() => (nameInput.input as HTMLInputElement).focus(), 0)
}

function showErr(node: HTMLElement, msg: string): void {
  node.textContent = msg
  node.classList.remove('hidden')
}

function field(
  label: string,
  type: string,
  value: string
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
    'w-full h-11 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  wrap.appendChild(l)
  wrap.appendChild(input)
  return { wrap, input }
}

function textareaField(label: string, value: string): { wrap: HTMLElement; input: HTMLElement } {
  const wrap = document.createElement('label')
  wrap.className = 'flex flex-col gap-1 text-sm'
  const l = document.createElement('span')
  l.className = 'opacity-70'
  l.textContent = label
  const input = document.createElement('textarea')
  input.value = value
  input.rows = 2
  input.className =
    'w-full p-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  wrap.appendChild(l)
  wrap.appendChild(input)
  return { wrap, input }
}

function selectField(
  label: string,
  options: string[],
  value: string
): { wrap: HTMLElement; input: HTMLElement } {
  const wrap = document.createElement('label')
  wrap.className = 'flex flex-col gap-1 text-sm'
  const l = document.createElement('span')
  l.className = 'opacity-70'
  l.textContent = label
  const input = document.createElement('select')
  input.className =
    'w-full h-11 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  for (const opt of options) {
    const o = document.createElement('option')
    o.value = opt
    o.textContent = opt
    input.appendChild(o)
  }
  input.value = value
  wrap.appendChild(l)
  wrap.appendChild(input)
  return { wrap, input }
}

/** Build a "Choose photo…" block with a thumbnail + file picker, matching
 *  the MOTM form. Also offers an "Or paste URL" link that reveals a text
 *  input so https:// URLs still work. */
function buildPhotoPicker(opts: {
  initial: string | undefined
  onChange: (next: string | undefined) => void
}): { wrap: HTMLElement } {
  const wrap = document.createElement('div')
  wrap.className = 'flex flex-col gap-2 text-sm'

  const label = document.createElement('span')
  label.className = 'opacity-70'
  label.textContent = 'Event photo (optional)'
  wrap.appendChild(label)

  let current: string | undefined = opts.initial

  const row = document.createElement('div')
  row.className = 'flex items-center gap-3'

  const thumb = document.createElement('div')
  thumb.className =
    'w-16 h-16 rounded-brand overflow-hidden bg-slate-700 flex-shrink-0 flex items-center justify-center text-2xl'
  const img = document.createElement('img')
  img.className = 'w-full h-full object-cover'
  img.style.display = 'none'
  const placeholder = document.createElement('span')
  placeholder.textContent = '🖼'
  thumb.appendChild(img)
  thumb.appendChild(placeholder)

  const renderThumb = (): void => {
    if (!current) {
      img.style.display = 'none'
      placeholder.style.display = ''
      img.src = ''
      return
    }
    // Support both local paths and https:// URLs.
    img.src = /^https?:\/\//i.test(current) ? current : fileUrl(current)
    img.style.display = 'block'
    placeholder.style.display = 'none'
  }
  renderThumb()
  row.appendChild(thumb)

  const btns = document.createElement('div')
  btns.className = 'flex flex-col gap-1'

  const pickBtn = document.createElement('button')
  pickBtn.type = 'button'
  pickBtn.className = 'btn btn-ghost text-sm'
  pickBtn.textContent = current ? 'Replace photo…' : 'Choose photo…'
  pickBtn.addEventListener('click', async () => {
    const src = await window.celebAPI.system.openFilePicker([
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
    ])
    if (!src) return
    try {
      const saved = await window.celebAPI.system.saveEventPhoto(src)
      current = saved
      opts.onChange(current)
      pickBtn.textContent = 'Replace photo…'
      renderThumb()
      clearBtn.style.display = ''
    } catch (err) {
      toast(`Couldn't save photo: ${String(err)}`, 'error')
    }
  })
  btns.appendChild(pickBtn)

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'btn btn-ghost text-xs text-rose-400'
  clearBtn.textContent = 'Remove'
  clearBtn.style.display = current ? '' : 'none'
  clearBtn.addEventListener('click', () => {
    current = undefined
    opts.onChange(current)
    pickBtn.textContent = 'Choose photo…'
    renderThumb()
    clearBtn.style.display = 'none'
    urlInput.value = ''
  })
  btns.appendChild(clearBtn)

  row.appendChild(btns)
  wrap.appendChild(row)

  // Optional URL fallback — collapsed by default.
  const urlDetails = document.createElement('details')
  urlDetails.className = 'text-xs'
  const urlSummary = document.createElement('summary')
  urlSummary.className = 'cursor-pointer opacity-70'
  urlSummary.textContent = 'Or paste a URL'
  urlDetails.appendChild(urlSummary)
  const urlInput = document.createElement('input')
  urlInput.type = 'text'
  urlInput.placeholder = 'https://…'
  urlInput.className =
    'mt-2 w-full h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  urlInput.value = current && /^https?:\/\//i.test(current) ? current : ''
  urlInput.addEventListener('input', () => {
    const v = urlInput.value.trim()
    if (v && /^https?:\/\//i.test(v)) {
      current = v
      opts.onChange(current)
      pickBtn.textContent = 'Replace photo…'
      clearBtn.style.display = ''
      renderThumb()
    } else if (!v && current && /^https?:\/\//i.test(current)) {
      current = undefined
      opts.onChange(current)
      pickBtn.textContent = 'Choose photo…'
      clearBtn.style.display = 'none'
      renderThumb()
    }
  })
  urlDetails.appendChild(urlInput)
  // Open the details drawer automatically if the initial value is a URL so
  // users see the current value right away when editing.
  if (current && /^https?:\/\//i.test(current)) urlDetails.open = true
  wrap.appendChild(urlDetails)

  return { wrap }
}

// Global Escape handler
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentEl) closeModal()
})
