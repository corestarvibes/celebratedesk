// Drag-and-drop + click-to-browse file input. Electron exposes the OS path
// on File objects (File.path) which is what we need to hand off to main-side
// IPC for reading. Falls back to the native file picker if drag-drop isn't
// used.
//
// Usage:
//   const dz = dropZone({
//     label: 'Drop CSV here or click to browse',
//     extensions: ['csv', 'tsv', 'txt'],
//     onFile: async (path) => { … }
//   })
//   parent.appendChild(dz)

import { toast } from './Toast'

interface DropZoneOpts {
  label: string
  /** File extensions to accept (no leading dot). Passed to the native picker. */
  extensions: string[]
  /** Called with the absolute path once a file is selected. */
  onFile: (path: string) => void | Promise<void>
}

export function dropZone(opts: DropZoneOpts): HTMLElement {
  const box = document.createElement('div')
  box.className =
    'border-2 border-dashed border-slate-400/40 rounded-brand px-4 py-6 text-center cursor-pointer transition-colors select-none'
  box.style.color = 'inherit'

  const icon = document.createElement('div')
  icon.style.fontSize = '28px'
  icon.style.lineHeight = '1'
  icon.style.marginBottom = '8px'
  icon.style.opacity = '0.7'
  icon.textContent = '📂'
  box.appendChild(icon)

  const text = document.createElement('div')
  text.className = 'text-sm'
  text.textContent = opts.label
  box.appendChild(text)

  const sub = document.createElement('div')
  sub.className = 'text-xs opacity-60 mt-1'
  sub.textContent = `Accepted: ${opts.extensions.map((e) => '.' + e).join(', ')}`
  box.appendChild(sub)

  const pickViaDialog = async (): Promise<void> => {
    const path = await window.celebAPI.system.openFilePicker([
      { name: 'CSV', extensions: opts.extensions }
    ])
    if (path) await opts.onFile(path)
  }

  box.addEventListener('click', () => {
    void pickViaDialog()
  })

  box.addEventListener('dragover', (e) => {
    e.preventDefault()
    box.style.borderColor = 'var(--brand-primary)'
    box.style.background = 'rgba(56, 189, 248, 0.06)'
  })
  box.addEventListener('dragleave', () => {
    box.style.borderColor = ''
    box.style.background = ''
  })
  box.addEventListener('drop', (e) => {
    e.preventDefault()
    box.style.borderColor = ''
    box.style.background = ''
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    // Electron 32+ deprecated File.path; 39+ removed it. Use the preload-
    // exposed webUtils.getPathForFile() first, fall back to the legacy
    // File.path for older Electron / Chromium builds.
    let resolved = ''
    try {
      resolved = window.celebAPI.system.getPathForFile(file) || ''
    } catch {
      /* ignore, fallback below */
    }
    if (!resolved) {
      resolved = (file as unknown as { path?: string }).path ?? ''
    }
    if (!resolved) {
      toast('Drag-drop not supported in this build — click to browse instead', 'warning')
      return
    }
    // Guard on extension so accidental drops don't trigger unrelated files.
    const ext = resolved.toLowerCase().split('.').pop() ?? ''
    if (!opts.extensions.includes(ext)) {
      toast(
        `Only ${opts.extensions.join(' / ')} files are accepted — got ".${ext}"`,
        'warning'
      )
      return
    }
    void opts.onFile(resolved)
  })

  return box
}
