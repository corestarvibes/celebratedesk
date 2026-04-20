import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  shell
} from 'electron'
import { pathToFileURL } from 'url'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import type {
  AttendanceRow,
  CelebEvent,
  CelebEventComputed,
  Coach,
  ImportResult,
  MotmMember,
  OverlayParams
} from '@shared/types'
import {
  bulkUpsert,
  bulkUpsertAttendance,
  clearAllEvents,
  clearAttendanceForMonth,
  deleteCoach,
  deleteEvent,
  deleteMotm,
  exportAllAsJSON,
  getActiveMotm,
  getAllCoaches,
  getAllEvents,
  getAllMotm,
  getAttendanceForMonth,
  getAttendanceMonths,
  getEventById,
  initDb,
  reorderCoaches,
  searchEvents,
  setActiveMotm,
  upsertCoach,
  upsertEvent,
  upsertMotm
} from './db'
import { generateNameOverlay } from './motmOverlay'
import { parseDocx, parsePastedText } from './docxParser'
import { splitFullName } from './motmOverlay'
import { installCsp } from './csp'
import { getAllSettings, getSetting, migrateSettings, setSetting } from './store'
import { startSchedulers, stopSchedulers } from './scheduler'
import { getLastRun, isRunning, runScrape } from './scraperRunner'
import {
  clearCredentials,
  isEncryptionAvailable,
  loadEncryptedCredentials,
  saveEncryptedCredentials
} from './credentials'
import { installUpdater } from './updater'
import { notifySummary } from './notifications'
import { getAge, getDaysUntil, getNextOccurrence, getYearsCount, todayInTz } from '@utils/dateHelpers'
import { parseCsv } from '@utils/csvParser'
import { logger } from '@utils/logger'

let mainWindow: BrowserWindow | null = null

function getTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function toComputed(ev: CelebEvent): CelebEventComputed {
  const tz = getTz()
  const nextOccurrence = getNextOccurrence(ev.date, ev.recurring, tz)
  const daysUntil = getDaysUntil(nextOccurrence, tz)
  const base: CelebEventComputed = { ...ev, nextOccurrence, daysUntil }
  if (ev.type === 'birthday') base.age = getAge(ev.date, nextOccurrence)
  if (ev.type === 'anniversary') base.yearsCount = getYearsCount(ev.date, nextOccurrence)
  return base
}

function createWindow(): void {
  const alwaysOnTop = getSetting('alwaysOnTop')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 540,
    show: !getSetting('startMinimized'),
    autoHideMenuBar: true,
    alwaysOnTop,
    backgroundColor: '#0f172a',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!getSetting('startMinimized')) mainWindow?.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  // ADD NEW IPC CHANNEL HERE — keep names in sync with src/preload/index.ts.

  // --- db ---
  ipcMain.handle('db:getAll', (): CelebEventComputed[] => getAllEvents().map(toComputed))
  ipcMain.handle('db:getById', (_e, id: string): CelebEventComputed | null => {
    const ev = getEventById(id)
    return ev ? toComputed(ev) : null
  })
  ipcMain.handle('db:upsert', (_e, partial: Partial<CelebEvent>): CelebEventComputed => {
    const saved = upsertEvent(partial)
    return toComputed(saved)
  })
  ipcMain.handle('db:delete', (_e, id: string): void => deleteEvent(id))
  ipcMain.handle('db:clearAll', (): number => clearAllEvents())
  ipcMain.handle('db:search', (_e, query: string): CelebEventComputed[] =>
    searchEvents(query).map(toComputed)
  )
  ipcMain.handle('db:exportJSON', (): string => exportAllAsJSON())
  ipcMain.handle('db:importCSV', (_e, csv: string): ImportResult => {
    const parsed = parseCsv(csv)
    if (parsed.rows.length === 0) {
      return {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: parsed.errors,
        detectedHeaders: parsed.detectedHeaders
      }
    }
    const res = bulkUpsert(
      parsed.rows.map((r) => ({
        name: r.name,
        type: r.type,
        date: r.date,
        recurring: r.recurring,
        notes: r.notes,
        photo_url: r.photo_url,
        source: 'csv'
      }))
    )
    return {
      ...res,
      skipped: 0,
      errors: parsed.errors,
      detectedHeaders: parsed.detectedHeaders
    }
  })

  // --- scraper ---
  ipcMain.handle('scraper:runNow', async () => {
    const res = await runScrape()
    if (mainWindow) mainWindow.webContents.send('scrape-complete', res)
    return res
  })
  ipcMain.handle('scraper:getStatus', () => ({ lastRun: getLastRun(), isRunning: isRunning() }))

  // --- settings ---
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key as never))
  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    setSetting(key as never, value as never)
    if (key === 'alwaysOnTop' && mainWindow) mainWindow.setAlwaysOnTop(!!value)
    if (key === 'scrapeIntervalHours') startSchedulers(() => mainWindow)
  })
  ipcMain.handle('settings:getAll', () => getAllSettings())

  // --- credentials ---
  ipcMain.handle('credentials:save', (_e, username: string, password: string) =>
    saveEncryptedCredentials(username, password)
  )
  ipcMain.handle('credentials:load', () => loadEncryptedCredentials())
  ipcMain.handle('credentials:clear', () => clearCredentials())
  ipcMain.handle('credentials:isEncryptionAvailable', () => isEncryptionAvailable())

  // --- system ---
  ipcMain.handle('system:openFilePicker', async (_e, filters: Electron.FileFilter[]) => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters ?? []
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle('system:openFolderPicker', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle('system:getTimezone', () => getTz())
  ipcMain.handle('system:setAlwaysOnTop', (_e, val: boolean) => {
    setSetting('alwaysOnTop', val)
    if (mainWindow) mainWindow.setAlwaysOnTop(val)
  })
  ipcMain.handle('system:setFullscreen', (_e, val: boolean) => {
    if (mainWindow) mainWindow.setFullScreen(val)
  })
  ipcMain.handle('system:getVersion', () => app.getVersion())

  ipcMain.handle('system:saveLogo', (_e, sourcePath: string): string => {
    const dir = join(app.getPath('userData'), 'logo')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const ext = extname(sourcePath) || '.png'
    const target = join(dir, `brand${ext}`)
    copyFileSync(sourcePath, target)
    setSetting('logoPath', target)
    return target
  })

  ipcMain.handle('system:pathBasename', (_e, p: string) => basename(p))
  ipcMain.handle('system:readTextFile', (_e, p: string): string => readFileSync(p, 'utf8'))

  // ADD NEW IPC CHANNEL HERE — motm:*, coaches:*, attendance:*.

  // --- motm ---
  ipcMain.handle('motm:getAll', (): MotmMember[] => getAllMotm())
  ipcMain.handle('motm:getActive', (): MotmMember | null => getActiveMotm())
  ipcMain.handle('motm:upsert', (_e, m: Partial<MotmMember>): MotmMember => upsertMotm(m))
  ipcMain.handle('motm:delete', (_e, id: string): void => deleteMotm(id))
  ipcMain.handle(
    'motm:setActive',
    (_e, id: string, month: string): MotmMember | null => setActiveMotm(id, month)
  )
  ipcMain.handle('motm:savePhoto', (_e, sourcePath: string): string => {
    const dir = join(app.getPath('userData'), 'motm-photos')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const ext = extname(sourcePath) || '.jpg'
    const target = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    copyFileSync(sourcePath, target)
    logger.info(
      `[motm] photo saved — source=${sourcePath} target=${target} exists=${existsSync(target)}`
    )
    return target
  })
  ipcMain.handle(
    'motm:generateOverlay',
    async (_e, raw: OverlayParams): Promise<string> => {
      // Allow callers to pass a single "name" OR explicit first/last.
      const first = raw.firstName?.trim()
      const last = raw.lastName?.trim()
      const firstLast = first || last
        ? { first: first || '', last: last || '' }
        : splitFullName(`${first ?? ''} ${last ?? ''}`.trim())
      const dir = join(app.getPath('userData'), 'motm-generated')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const outputPath =
        raw.outputPath && raw.outputPath.length > 0
          ? raw.outputPath
          : join(dir, `overlay-${Date.now()}.jpg`)
      const result = await generateNameOverlay({
        photoPath: raw.photoPath,
        firstName: firstLast.first,
        lastName: firstLast.last,
        nameStyle: raw.nameStyle,
        outputPath
      })
      logger.info(
        `[motm] overlay generated — result=${result} exists=${existsSync(result)}`
      )
      return result
    }
  )
  ipcMain.handle('motm:parseDocx', (_e, filePath: string) => parseDocx(filePath))
  ipcMain.handle('motm:parsePastedText', (_e, text: string) => parsePastedText(text))

  // --- coaches ---
  ipcMain.handle('coaches:getAll', (): Coach[] => getAllCoaches())
  ipcMain.handle(
    'coaches:upsert',
    (_e, c: Partial<Coach> & { name: string }): Coach => upsertCoach(c)
  )
  ipcMain.handle('coaches:delete', (_e, id: string): void => deleteCoach(id))
  ipcMain.handle('coaches:reorder', (_e, ids: string[]): void => reorderCoaches(ids))

  // --- attendance ---
  ipcMain.handle(
    'attendance:getForMonth',
    (_e, month: string): AttendanceRow[] => getAttendanceForMonth(month)
  )
  ipcMain.handle('attendance:getMonths', (): string[] => getAttendanceMonths())
  ipcMain.handle(
    'attendance:bulkUpsert',
    (
      _e,
      rows: { firstName: string; lastName: string; count: number }[],
      month: string
    ): { inserted: number; updated: number } => bulkUpsertAttendance(rows, month)
  )
  ipcMain.handle('attendance:clearMonth', (_e, month: string): number =>
    clearAttendanceForMonth(month)
  )
}

function summaryOnLaunch(): void {
  try {
    const tz = getTz()
    const events = getAllEvents()
    let todayCount = 0
    let weekCount = 0
    const today = todayInTz(tz)
    for (const ev of events) {
      const next = getNextOccurrence(ev.date, ev.recurring, tz)
      const days = getDaysUntil(next, tz)
      if (days === 0) todayCount += 1
      if (days >= 0 && days <= 7) weekCount += 1
    }
    notifySummary(todayCount, weekCount)
    logger.info(`launch summary: today=${todayCount}, week=${weekCount}, tz=${tz}, today=${today}`)
  } catch (err) {
    logger.warn('summary on launch failed', err)
  }
}

function registerGlobalShortcuts(): void {
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    if (!mainWindow) return
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
  })
}

// WORKAROUND: on some macOS + Electron combinations the GPU compositor silently
// drops canvas layers — canvases exist in the DOM with correct dimensions but
// never paint to screen. Falling back to software rendering fixes it across the
// board. Must be called BEFORE app.whenReady().
// To revert: comment this line out and the native GPU compositor is used again.
app.disableHardwareAcceleration()

// Register a custom `celeb-local://` protocol so the renderer can load files
// that live under `userData` (logos, MOTM photos, generated overlays).
// Chromium blocks `file://` URLs from non-file origins (e.g. http://localhost
// in dev), so we need a privileged scheme. The handler is installed later via
// protocol.handle() after `whenReady`. Must be registered BEFORE `whenReady`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'celeb-local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.celebratedesk.app')

  // Serve `celeb-local://<abs-path>` → the file at <abs-path>. URL form is
  // `celeb-local:///Users/foo%20bar/pic.png`. `url.pathname` gives the
  // already-decoded path; we hand it to `net.fetch` via `pathToFileURL` which
  // is allowed to touch disk from the main process.
  protocol.handle('celeb-local', async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname)
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      logger.warn('[celeb-local] failed to serve', request.url, err)
      return new Response(null, { status: 404 })
    }
  })

  installCsp()
  initDb()
  migrateSettings()
  registerIpc()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  startSchedulers(() => mainWindow)
  installUpdater(() => mainWindow)
  registerGlobalShortcuts()

  setTimeout(summaryOnLaunch, 2000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopSchedulers()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
