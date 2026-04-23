import './styles/main.css'
import { applyTheme, topBar } from './components/TopBar'
import { bottomNav } from './components/BottomNav'
import { bootstrap, getState, refreshEvents, setState, subscribe } from './state'
import { VIEW_REGISTRY, getViewById } from './views/viewRegistry'
import { motmAdvance, motmReset } from './views/MemberOfMonthView'
import { eventsAdvance, eventsReset } from './views/EventsView'
import { toast } from './components/Toast'
import { openSettings } from './modals/SettingsModal'
import { openEventForm } from './modals/EventFormModal'

async function main(): Promise<void> {
  const app = document.getElementById('app')!
  app.className = 'h-full flex flex-col'

  const header = topBar()
  const viewHost = document.createElement('main')
  viewHost.id = 'view-root'
  viewHost.className = 'flex-1 overflow-y-auto'
  const nav = bottomNav()

  app.appendChild(header)
  app.appendChild(viewHost)
  app.appendChild(nav)

  await bootstrap()
  applyTheme()
  renderView(viewHost)

  subscribe(() => renderView(viewHost))
  wireViewTransitionResets()
  wireKeyboard()
  wireSlideshow()
  wirePushEvents()

  // React to system theme changes when in auto
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((getState().settings?.theme ?? 'auto') === 'auto') applyTheme()
  })
}

/** Call any view-specific reset() hook whenever the active view changes.
 *  Ensures views with internal slide state start fresh next time they mount. */
function wireViewTransitionResets(): void {
  let prev = getState().activeView
  subscribe(() => {
    const next = getState().activeView
    if (next === prev) return
    // eslint-disable-next-line no-console
    console.log('[nav] transition', prev, '→', next)
    if (prev === 'motm') motmReset()
    if (prev === 'events') eventsReset()
    prev = next
  })
}

function renderView(host: HTMLElement): void {
  const s = getState()
  const view = getViewById(s.activeView) ?? VIEW_REGISTRY[0]!
  const rendered = view.component({
    events: s.events,
    searchQuery: s.searchQuery,
    timezone: s.timezone
  })
  host.replaceChildren(rendered)
}

function wireKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    // Ignore when typing in an input
    const t = e.target as HTMLElement
    const inField = t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
    if (inField) return
    const s = getState()

    if (e.key === ' ') {
      e.preventDefault()
      const next = !s.slideshowActive
      setState({ slideshowActive: next })
      window.celebAPI.settings.set('slideshowActive', next)
      return
    }
    if (e.key === 'ArrowRight') {
      moveView(1)
      return
    }
    if (e.key === 'ArrowLeft') {
      moveView(-1)
      return
    }
    if (e.key === 'r' || e.key === 'R') {
      void refreshEvents()
      return
    }
    if (e.key === 'f' || e.key === 'F') {
      void toggleFullscreen()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      void openSettings()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault()
      openEventForm(null)
      return
    }
  })
}

function moveView(delta: number): void {
  const ids = VIEW_REGISTRY.map((v) => v.id)
  const idx = ids.indexOf(getState().activeView)
  const next = ids[(idx + delta + ids.length) % ids.length]!
  setState({ activeView: next })
  void window.celebAPI.settings.set('activeView', next)
}

async function toggleFullscreen(): Promise<void> {
  const target = !document.fullscreenElement
  await window.celebAPI.system.setFullscreen(target)
}

let slideshowTimer: ReturnType<typeof setInterval> | null = null

function wireSlideshow(): void {
  const step = (): void => {
    const s = getState()
    if (!s.slideshowActive) return

    const knownIds = new Set(VIEW_REGISTRY.map((v) => v.id))
    const raw = s.settings?.slideshowViews ?? VIEW_REGISTRY.map((v) => v.id)
    const views = raw.filter((id) => knownIds.has(id))
    // eslint-disable-next-line no-console
    console.log('[slideshow] step — current=', s.activeView, ' full cycle views=', views)
    if (views.length === 0) return

    // Give the current view a chance to advance its own internal slide before
    // moving on. Views that opt into internal cycling export an xxxAdvance()
    // that returns true while there's more to show, false when done.
    if (s.activeView === 'motm') {
      const advanced = motmAdvance()
      if (advanced) {
        // eslint-disable-next-line no-console
        console.log('[slideshow] MOTM advanced internally — staying on motm')
        return
      }
    }
    if (s.activeView === 'events') {
      const advanced = eventsAdvance()
      if (advanced) {
        // eslint-disable-next-line no-console
        console.log('[slideshow] EVENTS advanced internally — staying on events')
        return
      }
    }

    const idx = views.indexOf(s.activeView)
    const next = views[(idx + 1) % views.length]!
    // eslint-disable-next-line no-console
    console.log('[slideshow] advancing to:', next)
    // Reset internal state of the view we're leaving so it starts fresh
    // the next time the slideshow reaches it.
    if (s.activeView === 'motm') motmReset()
    if (s.activeView === 'events') eventsReset()
    setState({ activeView: next })
  }
  const armOrDisarm = (): void => {
    if (slideshowTimer) {
      clearInterval(slideshowTimer)
      slideshowTimer = null
    }
    const s = getState()
    if (!s.slideshowActive) return
    const interval = Math.max(5, s.settings?.slideshowInterval ?? 30) * 1000
    slideshowTimer = setInterval(step, interval)
  }
  subscribe(armOrDisarm)
  armOrDisarm()
}

function wirePushEvents(): void {
  window.celebAPI.on('scrape-complete', (payload: unknown) => {
    const p = payload as { success: boolean; count?: number; error?: string }
    if (p?.success) {
      toast(`Synced ${p.count ?? 0} events`, 'success')
      void refreshEvents()
    } else if (p?.error) {
      toast(p.error, 'warning')
    }
  })
  window.celebAPI.on('day-changed', () => {
    void refreshEvents()
  })
  window.celebAPI.on('update-available', (payload: unknown) => {
    const p = payload as { version: string; ready?: boolean }
    toast(
      p.ready ? `Update ${p.version} ready — restart to install` : `Update ${p.version} available`,
      'info'
    )
  })
}

main().catch((err) => {
  console.error(err)
  document.getElementById('app')!.textContent = `Failed to start: ${String(err)}`
})
