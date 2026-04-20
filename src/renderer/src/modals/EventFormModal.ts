import type { CelebEvent, CelebEventComputed, EventType } from '@shared/types'
import { refreshEvents } from '../state'
import { toast } from '../components/Toast'

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

  const notesInput = textareaField('Notes', existing?.notes ?? '')
  const photoInput = field('Photo URL or path (optional)', 'text', existing?.photo_url ?? '')

  form.appendChild(nameInput.wrap)
  form.appendChild(typeSelect.wrap)
  form.appendChild(dateInput.wrap)
  form.appendChild(recurringWrap)
  form.appendChild(notesInput.wrap)
  form.appendChild(photoInput.wrap)

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
      photo_url: (photoInput.input as HTMLInputElement).value.trim() || undefined,
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

// Global Escape handler
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentEl) closeModal()
})
