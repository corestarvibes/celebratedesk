// Tiny observable store — no framework. Views subscribe and re-render on change.

import type { AppSettings, CelebEventComputed } from '@shared/types'

export interface AppState {
  events: CelebEventComputed[]
  settings: AppSettings | null
  searchQuery: string
  activeView: string
  timezone: string
  version: string
  slideshowActive: boolean
  encryptionAvailable: boolean
}

type Listener = (s: AppState) => void

const state: AppState = {
  events: [],
  settings: null,
  searchQuery: '',
  activeView: 'today',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  version: '0.0.0',
  slideshowActive: false,
  encryptionAvailable: true
}

const listeners = new Set<Listener>()

export function getState(): AppState {
  return state
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch)
  for (const l of listeners) l(state)
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function refreshEvents(): Promise<void> {
  const q = state.searchQuery.trim()
  const events = q ? await window.celebAPI.db.search(q) : await window.celebAPI.db.getAll()
  setState({ events })
}

export async function bootstrap(): Promise<void> {
  const [settings, version, tz, encAvail] = await Promise.all([
    window.celebAPI.settings.getAll(),
    window.celebAPI.system.getVersion(),
    window.celebAPI.system.getTimezone(),
    window.celebAPI.credentials.isEncryptionAvailable()
  ])
  setState({
    settings,
    version,
    timezone: tz,
    activeView: settings.activeView,
    slideshowActive: settings.slideshowActive,
    encryptionAvailable: encAvail
  })
  await refreshEvents()
}
