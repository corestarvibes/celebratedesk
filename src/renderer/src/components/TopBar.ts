import { getState, setState, subscribe } from '../state'
import { VIEW_REGISTRY } from '../views/viewRegistry'
import { searchBar } from './SearchBar'
import { openSettings } from '../modals/SettingsModal'
import { openEventForm } from '../modals/EventFormModal'
import { toast } from './Toast'
import { fileUrl } from '../utils/fileUrl'

export function topBar(): HTMLElement {
  const bar = document.createElement('header')
  bar.className =
    'h-12 flex items-center justify-between gap-3 px-4 border-b border-slate-400/10 surface rounded-none'
  bar.style.borderRadius = '0'

  // Left: logo + brand name + view label
  const left = document.createElement('div')
  left.className = 'flex items-center gap-3 min-w-0'
  const logo = document.createElement('img')
  logo.alt = 'logo'
  logo.className = 'h-8 w-auto brand-logo'
  logo.style.display = 'none'
  const starFallback = document.createElement('span')
  starFallback.textContent = '✨'
  starFallback.className = 'text-xl'
  const appName = document.createElement('span')
  appName.className = 'font-semibold whitespace-nowrap'
  const sep = document.createElement('span')
  sep.textContent = '·'
  sep.className = 'opacity-40'
  const viewLabel = document.createElement('span')
  viewLabel.className = 'text-sm opacity-70 truncate'

  left.appendChild(logo)
  left.appendChild(starFallback)
  left.appendChild(appName)
  left.appendChild(sep)
  left.appendChild(viewLabel)

  // Center: search
  const center = document.createElement('div')
  center.className = 'flex-1 flex justify-center'
  center.appendChild(searchBar())

  // Right: action buttons
  const right = document.createElement('div')
  right.className = 'flex items-center gap-1'

  const newBtn = document.createElement('button')
  newBtn.className = 'icon-btn'
  newBtn.title = 'New event (Cmd/Ctrl+N)'
  newBtn.textContent = '＋'
  newBtn.addEventListener('click', () => openEventForm(null))

  const slideshowBtn = document.createElement('button')
  slideshowBtn.className = 'icon-btn'
  slideshowBtn.title = 'Toggle slideshow (Space)'

  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'icon-btn'
  refreshBtn.title = 'Refresh data (R)'
  refreshBtn.textContent = '⟳'
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true
    try {
      const res = await window.celebAPI.scraper.runNow()
      if (res.success) toast(`Synced — ${res.count} events`, 'success')
      else toast(res.error ?? 'Sync failed', 'warning')
    } finally {
      refreshBtn.disabled = false
    }
  })

  const themeBtn = document.createElement('button')
  themeBtn.className = 'icon-btn'
  themeBtn.title = 'Toggle theme'
  themeBtn.addEventListener('click', async () => {
    const s = getState().settings
    if (!s) return
    const next = s.theme === 'dark' ? 'light' : s.theme === 'light' ? 'auto' : 'dark'
    await window.celebAPI.settings.set('theme', next)
    setState({ settings: { ...s, theme: next } })
    applyTheme()
  })

  const gearBtn = document.createElement('button')
  gearBtn.className = 'icon-btn'
  gearBtn.title = 'Settings (Cmd/Ctrl+,)'
  gearBtn.textContent = '⚙'
  gearBtn.addEventListener('click', () => openSettings())

  right.appendChild(newBtn)
  right.appendChild(slideshowBtn)
  right.appendChild(refreshBtn)
  right.appendChild(themeBtn)
  right.appendChild(gearBtn)

  bar.appendChild(left)
  bar.appendChild(center)
  bar.appendChild(right)

  const render = (): void => {
    const s = getState()
    // eslint-disable-next-line no-console
    console.log(
      '[topbar] render — logoPath=',
      s.settings?.logoPath,
      ' brandName=',
      s.settings?.brandName
    )
    appName.textContent = s.settings?.brandName ?? 'CelebrateDesk'
    const view = VIEW_REGISTRY.find((v) => v.id === s.activeView)
    viewLabel.textContent = view ? view.label : ''
    slideshowBtn.textContent = s.slideshowActive ? '⏸' : '▶'
    themeBtn.textContent =
      s.settings?.theme === 'dark' ? '🌙' : s.settings?.theme === 'light' ? '☀' : '🖥'
    if (s.settings?.logoPath) {
      const rawPath = s.settings.logoPath
      const encoded = fileUrl(rawPath)
      // eslint-disable-next-line no-console
      console.log('[logo] rawPath=', rawPath, ' isAbsolute=', rawPath.startsWith('/'))
      // eslint-disable-next-line no-console
      console.log('[logo] src=', encoded)
      logo.onerror = (e): void => {
        // eslint-disable-next-line no-console
        console.error('[logo] failed:', e, ' src=', logo.src, ' rawPath=', rawPath)
        logo.style.display = 'none'
        starFallback.style.display = ''
      }
      logo.onload = (): void => {
        // eslint-disable-next-line no-console
        console.log('[logo] loaded OK:', logo.naturalWidth, 'x', logo.naturalHeight)
      }
      logo.src = encoded
      logo.style.display = 'block'
      starFallback.style.display = 'none'
    } else {
      logo.style.display = 'none'
      starFallback.style.display = ''
    }
  }

  slideshowBtn.addEventListener('click', async () => {
    const next = !getState().slideshowActive
    setState({ slideshowActive: next })
    await window.celebAPI.settings.set('slideshowActive', next)
  })

  subscribe(render)
  render()
  return bar
}

export function applyTheme(): void {
  const theme = getState().settings?.theme ?? 'auto'
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else if (theme === 'light') root.classList.remove('dark')
  else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
  // Apply brand accent
  const accent = getState().settings?.accentColor
  if (accent) root.style.setProperty('--brand-primary', accent)
}
