import type { AppSettings, ImportResult, ScraperSelectors } from '@shared/types'
import { bootstrap, getState, setState } from '../state'
import { toast } from '../components/Toast'
import { applyTheme } from '../components/TopBar'
import { burstNow } from '../components/ConfettiOverlay'
import {
  attendanceSection,
  coachesSection,
  motmSection,
  qrCodesSection
} from './settingsSections'

let currentEl: HTMLElement | null = null

function closeModal(): void {
  if (currentEl) {
    currentEl.remove()
    currentEl = null
  }
}

export async function openSettings(_initialSection?: string): Promise<void> {
  closeModal()
  const settings = await window.celebAPI.settings.getAll()
  const creds = await window.celebAPI.credentials.load()

  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4 fade-in'
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal()
  })

  const panel = document.createElement('div')
  panel.className =
    'surface max-w-2xl w-full p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto'
  panel.addEventListener('click', (e) => e.stopPropagation())

  const head = document.createElement('div')
  head.className = 'flex items-center justify-between'
  const title = document.createElement('h2')
  title.className = 'text-[18px] font-semibold'
  title.textContent = 'Settings'
  const close = document.createElement('button')
  close.className = 'icon-btn'
  close.textContent = '✕'
  close.addEventListener('click', closeModal)
  head.appendChild(title)
  head.appendChild(close)
  panel.appendChild(head)

  // --- Appearance ---
  panel.appendChild(section('Appearance', appearanceSection(settings)))

  // --- Branding ---
  panel.appendChild(section('Branding', brandingSection(settings)))

  // --- Slideshow ---
  panel.appendChild(section('Slideshow', slideshowSection(settings)))

  // --- Notifications ---
  panel.appendChild(section('Notifications', notificationsSection(settings)))

  // --- Data source ---
  panel.appendChild(section('Data', dataSection(settings)))

  // --- Scraper config ---
  panel.appendChild(section('Member of the Month', motmSection()))

  panel.appendChild(section('Coach Rotation', coachesSection()))

  panel.appendChild(section('Attendance', attendanceSection()))

  panel.appendChild(section('QR Codes', qrCodesSection()))

  panel.appendChild(section('Chalk It Pro scraper', scraperSection(settings, creds)))

  // --- About ---
  const about = document.createElement('div')
  about.className = 'text-xs opacity-60 pt-2 border-t border-slate-400/10'
  about.textContent = `CelebrateDesk v${getState().version}`
  panel.appendChild(about)

  overlay.appendChild(panel)
  document.body.appendChild(overlay)
  currentEl = overlay
}

function section(title: string, body: HTMLElement): HTMLElement {
  const wrap = document.createElement('section')
  wrap.className = 'flex flex-col gap-2'
  const h = document.createElement('h3')
  h.className = 'text-sm font-semibold opacity-70 uppercase tracking-wide'
  h.textContent = title
  wrap.appendChild(h)
  wrap.appendChild(body)
  return wrap
}

function appearanceSection(settings: AppSettings): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-2'

  const themeRow = labeledSelect(
    'Theme',
    ['auto', 'dark', 'light'],
    settings.theme,
    async (v) => {
      await window.celebAPI.settings.set('theme', v)
      setState({ settings: { ...getState().settings!, theme: v as AppSettings['theme'] } })
      applyTheme()
    }
  )
  body.appendChild(themeRow)

  const aotRow = labeledCheckbox('Always on top', settings.alwaysOnTop, async (v) => {
    await window.celebAPI.settings.set('alwaysOnTop', v)
    await window.celebAPI.system.setAlwaysOnTop(v)
  })
  body.appendChild(aotRow)

  return body
}

function brandingSection(settings: AppSettings): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-2'

  const nameRow = labeledInput('App name', settings.brandName, 'text', async (v) => {
    await window.celebAPI.settings.set('brandName', v)
    setState({ settings: { ...getState().settings!, brandName: v } })
  })
  body.appendChild(nameRow)

  const colorRow = labeledInput('Accent color', settings.accentColor, 'color', async (v) => {
    await window.celebAPI.settings.set('accentColor', v)
    setState({ settings: { ...getState().settings!, accentColor: v } })
    document.documentElement.style.setProperty('--brand-primary', v)
  })
  body.appendChild(colorRow)

  const logoWrap = document.createElement('div')
  logoWrap.className = 'flex items-center gap-2'
  const logoBtn = document.createElement('button')
  logoBtn.className = 'btn btn-ghost'
  logoBtn.textContent = settings.logoPath ? 'Replace logo…' : 'Choose logo…'
  logoBtn.addEventListener('click', async () => {
    // eslint-disable-next-line no-console
    console.log('[logo-picker] button clicked, opening file dialog')
    const src = await window.celebAPI.system.openFilePicker([
      { name: 'Images', extensions: ['png', 'svg', 'jpg', 'jpeg'] }
    ])
    // eslint-disable-next-line no-console
    console.log('[logo-picker] picked source path=', src)
    if (!src) return
    try {
      const saved = await window.celebAPI.system.saveLogo(src)
      // eslint-disable-next-line no-console
      console.log('[logo-picker] saveLogo returned=', saved)
      await window.celebAPI.settings.set('logoPath', saved)
      setState({ settings: { ...getState().settings!, logoPath: saved } })
      // eslint-disable-next-line no-console
      console.log('[logo-picker] state updated, new logoPath=', getState().settings?.logoPath)
      toast('Logo updated', 'success')
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[logo-picker] FAILED:', e)
      toast(`Couldn't save logo: ${String(e)}`, 'error')
    }
  })
  logoWrap.appendChild(logoBtn)
  if (settings.logoPath) {
    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn btn-ghost text-rose-500'
    clearBtn.textContent = 'Remove'
    clearBtn.addEventListener('click', async () => {
      await window.celebAPI.settings.set('logoPath', null)
      setState({ settings: { ...getState().settings!, logoPath: null } })
    })
    logoWrap.appendChild(clearBtn)
  }
  body.appendChild(logoWrap)

  const reset = document.createElement('button')
  reset.className = 'btn btn-ghost self-start text-xs opacity-70'
  reset.textContent = 'Reset branding to defaults'
  reset.addEventListener('click', async () => {
    await window.celebAPI.settings.set('brandName', 'CelebrateDesk')
    await window.celebAPI.settings.set('accentColor', '#f59e0b')
    await window.celebAPI.settings.set('logoPath', null)
    document.documentElement.style.setProperty('--brand-primary', '#f59e0b')
    await bootstrap()
    toast('Branding reset', 'success')
    closeModal()
    openSettings()
  })
  body.appendChild(reset)

  return body
}

function slideshowSection(settings: AppSettings): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-2'
  body.appendChild(
    labeledInput('Seconds per view', String(settings.slideshowInterval), 'number', async (v) => {
      const n = Math.max(5, Number(v) || 30)
      await window.celebAPI.settings.set('slideshowInterval', n)
    })
  )
  return body
}

function notificationsSection(settings: AppSettings): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-2'
  body.appendChild(
    labeledCheckbox('Enable notifications', settings.notificationsEnabled, async (v) => {
      await window.celebAPI.settings.set('notificationsEnabled', v)
    })
  )
  body.appendChild(
    labeledInput('Notify days ahead', String(settings.notifyDaysAhead), 'number', async (v) => {
      await window.celebAPI.settings.set('notifyDaysAhead', Math.max(0, Number(v) || 7))
    })
  )
  return body
}

function dataSection(settings: AppSettings): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-2'
  body.appendChild(
    labeledSelect('Source', ['manual', 'csv', 'scrape'], settings.dataSource, async (v) => {
      await window.celebAPI.settings.set('dataSource', v)
    })
  )

  const row = document.createElement('div')
  row.className = 'flex gap-2 flex-wrap'
  const importBtn = document.createElement('button')
  importBtn.className = 'btn btn-ghost'
  importBtn.textContent = 'Import Events CSV… (birthdays / anniversaries)'
  importBtn.addEventListener('click', async () => {
    const path = await window.celebAPI.system.openFilePicker([
      { name: 'CSV', extensions: ['csv'] }
    ])
    if (!path) return
    try {
      const txt = await window.celebAPI.system.readTextFile(path)
      const res = await window.celebAPI.db.importCSV(txt)
      const errs = res.errors?.length ?? 0
      if (errs > 0) {
        showImportErrors(res)
      } else {
        toast(`Imported ${res.inserted} new, ${res.updated} updated`, 'success')
      }
      await bootstrap()
    } catch (e) {
      toast(`Import failed: ${String(e)}`, 'error')
    }
  })
  row.appendChild(importBtn)

  const exportBtn = document.createElement('button')
  exportBtn.className = 'btn btn-ghost'
  exportBtn.textContent = 'Export JSON'
  exportBtn.addEventListener('click', async () => {
    const json = await window.celebAPI.db.exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'celebratedesk-export.json'
    a.click()
    URL.revokeObjectURL(url)
  })
  row.appendChild(exportBtn)

  const clearBtn = document.createElement('button')
  clearBtn.className = 'btn btn-ghost text-rose-500'
  clearBtn.textContent = 'Clear all events…'
  clearBtn.addEventListener('click', async () => {
    const current = (await window.celebAPI.db.getAll()).length
    if (current === 0) {
      toast('Nothing to clear.', 'info')
      return
    }
    const ok = confirm(
      `Delete all ${current} event${current === 1 ? '' : 's'}? This cannot be undone.\n\n` +
        `Tip: click "Export JSON" first if you want a backup.`
    )
    if (!ok) return
    const removed = await window.celebAPI.db.clearAll()
    toast(`Cleared ${removed} event${removed === 1 ? '' : 's'}.`, 'success')
    await bootstrap()
  })
  row.appendChild(clearBtn)

  const testConfettiBtn = document.createElement('button')
  testConfettiBtn.className = 'btn btn-ghost'
  testConfettiBtn.textContent = '🎉 Test confetti'
  testConfettiBtn.addEventListener('click', () => burstNow())
  row.appendChild(testConfettiBtn)

  body.appendChild(row)

  return body
}

function scraperSection(
  settings: AppSettings,
  creds: { username: string; password: string } | null
): HTMLElement {
  const body = document.createElement('div')
  body.className = 'flex flex-col gap-2'

  if (!getState().encryptionAvailable) {
    const warn = document.createElement('div')
    warn.className = 'text-xs rounded-brand border border-amber-500 text-amber-500 p-2'
    warn.textContent =
      'Credential encryption is unavailable on this Linux configuration. Credentials will be stored in plaintext.'
    body.appendChild(warn)
  }

  const userRow = labeledInput('Username', creds?.username ?? '', 'text', () => {})
  const passRow = labeledInput('Password', creds?.password ?? '', 'password', () => {})
  body.appendChild(userRow)
  body.appendChild(passRow)

  const urlRow = labeledInput(
    'Login URL',
    settings.scraperConfig.loginUrl,
    'text',
    async (v) => {
      const next = { ...settings.scraperConfig, loginUrl: v }
      await window.celebAPI.settings.set('scraperConfig', next)
    }
  )
  const membersRow = labeledInput(
    'Members URL',
    settings.scraperConfig.membersUrl,
    'text',
    async (v) => {
      const next = { ...settings.scraperConfig, membersUrl: v }
      await window.celebAPI.settings.set('scraperConfig', next)
    }
  )
  body.appendChild(urlRow)
  body.appendChild(membersRow)

  const selBody = document.createElement('details')
  selBody.className = 'text-sm'
  const selSum = document.createElement('summary')
  selSum.className = 'cursor-pointer opacity-80'
  selSum.textContent = 'Selectors (advanced)'
  selBody.appendChild(selSum)
  const selWrap = document.createElement('div')
  selWrap.className = 'flex flex-col gap-2 mt-2'
  ;(Object.keys(settings.scraperConfig.selectors) as (keyof ScraperSelectors)[]).forEach((k) => {
    const row = labeledInput(
      k,
      settings.scraperConfig.selectors[k],
      'text',
      async (v) => {
        const selectors: ScraperSelectors = { ...settings.scraperConfig.selectors, [k]: v }
        const next = { ...settings.scraperConfig, selectors }
        await window.celebAPI.settings.set('scraperConfig', next)
      }
    )
    selWrap.appendChild(row)
  })
  selBody.appendChild(selWrap)
  body.appendChild(selBody)

  const actions = document.createElement('div')
  actions.className = 'flex gap-2 mt-2'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'btn btn-primary'
  saveBtn.textContent = 'Save credentials'
  saveBtn.addEventListener('click', async () => {
    const u = (userRow.querySelector('input') as HTMLInputElement).value.trim()
    const p = (passRow.querySelector('input') as HTMLInputElement).value
    if (!u || !p) {
      toast('Enter a username and password first', 'warning')
      return
    }
    await window.celebAPI.credentials.save(u, p)
    toast('Credentials saved', 'success')
  })
  const clearBtn = document.createElement('button')
  clearBtn.className = 'btn btn-ghost text-rose-500'
  clearBtn.textContent = 'Clear credentials'
  clearBtn.addEventListener('click', async () => {
    await window.celebAPI.credentials.clear()
    toast('Credentials cleared', 'success')
  })
  const runBtn = document.createElement('button')
  runBtn.className = 'btn btn-ghost'
  runBtn.textContent = 'Run scrape now'
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true
    try {
      const res = await window.celebAPI.scraper.runNow()
      if (res.success) {
        toast(`Scraped ${res.count} events`, 'success')
        await bootstrap()
      } else toast(res.error ?? 'Scrape failed', 'error')
    } finally {
      runBtn.disabled = false
    }
  })
  actions.appendChild(saveBtn)
  actions.appendChild(clearBtn)
  actions.appendChild(runBtn)
  body.appendChild(actions)

  return body
}

function labeledInput(
  label: string,
  value: string,
  type: string,
  onChange: (v: string) => void
): HTMLElement {
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
  input.addEventListener('change', () => onChange(input.value))
  wrap.appendChild(l)
  wrap.appendChild(input)
  return wrap
}

function labeledSelect(
  label: string,
  opts: string[],
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'flex flex-col gap-1 text-sm'
  const l = document.createElement('span')
  l.className = 'opacity-70'
  l.textContent = label
  const input = document.createElement('select')
  input.className =
    'w-full h-10 px-3 rounded-brand border border-slate-400/30 bg-transparent focus:outline-none focus:border-brand-primary'
  for (const opt of opts) {
    const o = document.createElement('option')
    o.value = opt
    o.textContent = opt
    input.appendChild(o)
  }
  input.value = value
  input.addEventListener('change', () => onChange(input.value))
  wrap.appendChild(l)
  wrap.appendChild(input)
  return wrap
}

function labeledCheckbox(
  label: string,
  value: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'flex items-center gap-2 text-sm'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  const l = document.createElement('span')
  l.textContent = label
  wrap.appendChild(input)
  wrap.appendChild(l)
  return wrap
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentEl) closeModal()
})

/** Pop up a details modal listing each parse error with row number, reason, and raw line. */
function showImportErrors(res: ImportResult): void {
  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 fade-in'
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })

  const panel = document.createElement('div')
  panel.className = 'surface max-w-2xl w-full p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto'
  panel.addEventListener('click', (e) => e.stopPropagation())

  const head = document.createElement('div')
  head.className = 'flex items-center justify-between'
  const title = document.createElement('h2')
  title.className = 'text-[18px] font-semibold'
  const errs = res.errors ?? []
  title.textContent = `Import finished with ${errs.length} error${errs.length === 1 ? '' : 's'}`
  const close = document.createElement('button')
  close.className = 'icon-btn'
  close.textContent = '✕'
  close.addEventListener('click', () => overlay.remove())
  head.appendChild(title)
  head.appendChild(close)
  panel.appendChild(head)

  const summary = document.createElement('p')
  summary.className = 'text-sm opacity-70'
  summary.textContent = `${res.inserted} new, ${res.updated} updated. ${errs.length} row${errs.length === 1 ? '' : 's'} skipped.`
  panel.appendChild(summary)

  if (res.detectedHeaders && res.detectedHeaders.length > 0) {
    const hdr = document.createElement('div')
    hdr.className = 'text-xs opacity-60'
    hdr.textContent = `Detected headers: [${res.detectedHeaders.join(', ')}]`
    panel.appendChild(hdr)
  }

  const list = document.createElement('div')
  list.className = 'flex flex-col gap-2 mt-2'
  for (const err of errs) {
    const row = document.createElement('div')
    row.className = 'surface p-3 border border-rose-500/40'
    const top = document.createElement('div')
    top.className = 'flex items-baseline gap-2'
    const rowNum = document.createElement('span')
    rowNum.className = 'type-badge'
    rowNum.textContent = `Row ${err.row}`
    const msg = document.createElement('span')
    msg.className = 'text-sm'
    msg.textContent = err.message
    top.appendChild(rowNum)
    top.appendChild(msg)
    row.appendChild(top)
    if (err.rawLine) {
      const raw = document.createElement('pre')
      raw.className =
        'text-xs opacity-70 mt-2 font-mono whitespace-pre-wrap break-all bg-slate-400/10 p-2 rounded'
      raw.textContent = err.rawLine
      row.appendChild(raw)
    }
    list.appendChild(row)
  }
  panel.appendChild(list)

  const footer = document.createElement('div')
  footer.className = 'flex justify-end mt-2'
  const ok = document.createElement('button')
  ok.className = 'btn btn-primary'
  ok.textContent = 'Done'
  ok.addEventListener('click', () => overlay.remove())
  footer.appendChild(ok)
  panel.appendChild(footer)

  overlay.appendChild(panel)
  document.body.appendChild(overlay)
}
