// Content sync — Mac-only writer side. Detects Google Drive for Desktop's
// mount point, debounces snapshot pushes, exposes status + manual-trigger
// to the renderer via IPC.
//
// Architecture: see DEPLOYMENT.md Part 9 (Sync). Tldr:
//   Mac edits content -> 5s debounce -> snapshot.zip + snapshot.json
//   dropped in <Drive>/CelebrateDesk Sync/ -> Drive uploads -> mini PCs
//   poll, restore, restart.
//
// Hard rules:
// - This module REFUSES to act as writer on non-darwin. Followers (mini
//   PCs) must never push their own snapshots back; that would race the
//   Mac and produce data loss.
// - Snapshot writes are atomic (snapshot.json is written LAST so the
//   follower's "newer manifest?" check never sees a partial state).
// - Pending debounced snapshots are flushed on app `before-quit` so a
//   user closing the dock app doesn't lose the last edit.

import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSnapshot, readManifest } from './snapshot'
import { getSetting, setSetting } from './store'
import { logger } from '@utils/logger'

const SYNC_FOLDER_NAME = 'CelebrateDesk Sync'
const DEBOUNCE_MS = 5000

export type SyncState =
  | { kind: 'disabled' }
  | { kind: 'idle'; folder: string; lastSnapshot: { timestamp: number; sha256: string } | null }
  | { kind: 'pending' } // change detected, waiting for debounce window to close
  | { kind: 'syncing' }
  | { kind: 'error'; message: string }

let currentState: SyncState = { kind: 'disabled' }
let debounceTimer: NodeJS.Timeout | null = null
let mainWindow: (() => BrowserWindow | null) | null = null

export function initSync(getMainWindow: () => BrowserWindow | null): void {
  mainWindow = getMainWindow

  // Followers (mini PCs) get a no-op writer. The PowerShell watcher
  // handles their side of the pipeline; the app itself never pushes.
  if (process.platform !== 'darwin') {
    logger.info('[sync] writer disabled on non-darwin platform')
    currentState = { kind: 'disabled' }
    return
  }

  const enabled = getSetting('syncEnabled') === true
  if (!enabled) {
    currentState = { kind: 'disabled' }
    return
  }

  const folder = resolveSyncFolder()
  if (!folder) {
    currentState = {
      kind: 'error',
      message: 'Could not find Google Drive for Desktop. Install it and sign in, then re-enable sync.'
    }
    emitStatus()
    return
  }

  ensureFolder(folder)
  currentState = {
    kind: 'idle',
    folder,
    lastSnapshot: readManifest(join(folder, 'snapshot.json'))
  }
  emitStatus()

  // Flush any pending debounced snapshot before the app exits — otherwise
  // a quick edit-then-quit sequence loses the change.
  app.on('before-quit', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
      logger.info('[sync] flushing pending snapshot before quit')
      // synchronous-ish — best effort
      void runSnapshot('flush-before-quit')
    }
  })
}

/** Called by the IPC layer on every mutating channel. Schedules a
 *  debounced snapshot. Cheap, idempotent, safe to spam. */
export function notifyChange(reason: string): void {
  if (process.platform !== 'darwin') return
  if (currentState.kind === 'disabled' || currentState.kind === 'error') return

  if (debounceTimer) clearTimeout(debounceTimer)
  if (currentState.kind === 'idle') {
    currentState = { kind: 'pending' }
    emitStatus()
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSnapshot(reason)
  }, DEBOUNCE_MS)
}

/** Manual trigger from the UI — bypasses the debounce. */
export async function syncNow(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'darwin') {
    return { ok: false, error: 'Sync writer is Mac-only' }
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  return runSnapshot('manual')
}

export function setSyncEnabled(enabled: boolean): { ok: boolean; error?: string } {
  if (process.platform !== 'darwin') {
    return { ok: false, error: 'Sync writer is Mac-only' }
  }
  setSetting('syncEnabled', enabled)
  if (enabled) {
    const folder = resolveSyncFolder()
    if (!folder) {
      currentState = {
        kind: 'error',
        message: 'Could not find Google Drive for Desktop. Install it and sign in, then try again.'
      }
      emitStatus()
      return { ok: false, error: currentState.kind === 'error' ? currentState.message : 'unknown' }
    }
    ensureFolder(folder)
    currentState = {
      kind: 'idle',
      folder,
      lastSnapshot: readManifest(join(folder, 'snapshot.json'))
    }
  } else {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    currentState = { kind: 'disabled' }
  }
  emitStatus()
  return { ok: true }
}

export function getSyncStatus(): SyncState {
  return currentState
}

// ---------------------------------------------------------------------------

async function runSnapshot(reason: string): Promise<{ ok: boolean; error?: string }> {
  if (currentState.kind === 'disabled') {
    return { ok: false, error: 'sync disabled' }
  }
  const folder = resolveSyncFolder()
  if (!folder) {
    currentState = {
      kind: 'error',
      message: 'Drive folder is not available — is Google Drive for Desktop running?'
    }
    emitStatus()
    return { ok: false, error: currentState.message }
  }
  ensureFolder(folder)

  currentState = { kind: 'syncing' }
  emitStatus()

  try {
    logger.info(`[sync] snapshotting (reason: ${reason})`)
    const result = await createSnapshot(folder)
    currentState = {
      kind: 'idle',
      folder,
      lastSnapshot: { timestamp: result.timestamp, sha256: result.sha256 }
    }
    emitStatus()
    logger.info(
      `[sync] pushed snapshot ${result.sha256.slice(0, 8)} (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`
    )
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    logger.warn(`[sync] snapshot failed: ${msg}`)
    currentState = { kind: 'error', message: msg }
    emitStatus()
    return { ok: false, error: msg }
  }
}

/**
 * Locate Google Drive for Desktop's "My Drive" folder on macOS.
 *
 * Modern Drive for Desktop mounts at `~/Library/CloudStorage/GoogleDrive-<email>/My Drive/`.
 * Older installs sometimes used `/Volumes/GoogleDrive/My Drive/`. We check
 * both and return the first one that resolves.
 *
 * Returns the absolute path to the SYNC folder (which we may need to
 * create), not the My Drive root.
 */
function resolveSyncFolder(): string | null {
  // 1. The user can override via settings if their setup is unusual.
  const override = getSetting('syncFolderOverride')
  if (typeof override === 'string' && override.trim().length > 0) {
    return join(override.trim(), SYNC_FOLDER_NAME)
  }

  // 2. Modern Mac Drive for Desktop layout.
  const cloudStorage = join(homedir(), 'Library', 'CloudStorage')
  if (existsSync(cloudStorage)) {
    for (const entry of readdirSync(cloudStorage, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (!entry.name.startsWith('GoogleDrive-')) continue
      const myDrive = join(cloudStorage, entry.name, 'My Drive')
      if (existsSync(myDrive)) {
        return join(myDrive, SYNC_FOLDER_NAME)
      }
    }
  }

  // 3. Legacy mount path.
  const legacy = '/Volumes/GoogleDrive/My Drive'
  if (existsSync(legacy)) {
    return join(legacy, SYNC_FOLDER_NAME)
  }

  return null
}

function ensureFolder(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function emitStatus(): void {
  const win = mainWindow ? mainWindow() : null
  if (win) win.webContents.send('sync-status', currentState)
}
