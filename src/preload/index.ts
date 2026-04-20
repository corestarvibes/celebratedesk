// ADD NEW IPC CHANNEL HERE — keep names in sync with src/main/index.ts.
// All renderer ↔ main traffic flows through window.celebAPI.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  AttendanceRow,
  CelebEvent,
  CelebEventComputed,
  Coach,
  Credentials,
  ImportResult,
  MotmMember,
  OverlayParams,
  ParsedDocxResult,
  ScrapeResult,
  ScraperStatus
} from '../shared/types'

type PushChannel = 'scrape-complete' | 'day-changed' | 'update-available'
type PushListener = (data: unknown) => void

const listeners = new Map<PushListener, (e: IpcRendererEvent, data: unknown) => void>()

const celebAPI = {
  db: {
    getAll: (): Promise<CelebEventComputed[]> => ipcRenderer.invoke('db:getAll'),
    getById: (id: string): Promise<CelebEventComputed | null> =>
      ipcRenderer.invoke('db:getById', id),
    upsert: (event: Partial<CelebEvent>): Promise<CelebEventComputed> =>
      ipcRenderer.invoke('db:upsert', event),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('db:delete', id),
    clearAll: (): Promise<number> => ipcRenderer.invoke('db:clearAll'),
    search: (query: string): Promise<CelebEventComputed[]> =>
      ipcRenderer.invoke('db:search', query),
    exportJSON: (): Promise<string> => ipcRenderer.invoke('db:exportJSON'),
    importCSV: (csv: string): Promise<ImportResult> => ipcRenderer.invoke('db:importCSV', csv)
  },
  scraper: {
    runNow: (): Promise<ScrapeResult> => ipcRenderer.invoke('scraper:runNow'),
    getStatus: (): Promise<ScraperStatus> => ipcRenderer.invoke('scraper:getStatus')
  },
  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: (): Promise<AppSettings> => ipcRenderer.invoke('settings:getAll')
  },
  credentials: {
    save: (username: string, password: string): Promise<void> =>
      ipcRenderer.invoke('credentials:save', username, password),
    load: (): Promise<Credentials | null> => ipcRenderer.invoke('credentials:load'),
    clear: (): Promise<void> => ipcRenderer.invoke('credentials:clear'),
    isEncryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('credentials:isEncryptionAvailable')
  },
  system: {
    openFilePicker: (filters: Electron.FileFilter[]): Promise<string | null> =>
      ipcRenderer.invoke('system:openFilePicker', filters),
    openFolderPicker: (): Promise<string | null> => ipcRenderer.invoke('system:openFolderPicker'),
    getTimezone: (): Promise<string> => ipcRenderer.invoke('system:getTimezone'),
    setAlwaysOnTop: (val: boolean): Promise<void> =>
      ipcRenderer.invoke('system:setAlwaysOnTop', val),
    setFullscreen: (val: boolean): Promise<void> => ipcRenderer.invoke('system:setFullscreen', val),
    getVersion: (): Promise<string> => ipcRenderer.invoke('system:getVersion'),
    saveLogo: (sourcePath: string): Promise<string> =>
      ipcRenderer.invoke('system:saveLogo', sourcePath),
    pathBasename: (p: string): Promise<string> => ipcRenderer.invoke('system:pathBasename', p),
    readTextFile: (p: string): Promise<string> => ipcRenderer.invoke('system:readTextFile', p)
  },
  motm: {
    getAll: (): Promise<MotmMember[]> => ipcRenderer.invoke('motm:getAll'),
    getActive: (): Promise<MotmMember | null> => ipcRenderer.invoke('motm:getActive'),
    upsert: (m: Partial<MotmMember>): Promise<MotmMember> => ipcRenderer.invoke('motm:upsert', m),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('motm:delete', id),
    setActive: (id: string, month: string): Promise<MotmMember | null> =>
      ipcRenderer.invoke('motm:setActive', id, month),
    savePhoto: (sourcePath: string): Promise<string> =>
      ipcRenderer.invoke('motm:savePhoto', sourcePath),
    generateOverlay: (params: OverlayParams): Promise<string> =>
      ipcRenderer.invoke('motm:generateOverlay', params),
    parseDocx: (filePath: string): Promise<ParsedDocxResult> =>
      ipcRenderer.invoke('motm:parseDocx', filePath),
    parsePastedText: (text: string): Promise<ParsedDocxResult> =>
      ipcRenderer.invoke('motm:parsePastedText', text)
  },
  coaches: {
    getAll: (): Promise<Coach[]> => ipcRenderer.invoke('coaches:getAll'),
    upsert: (c: Partial<Coach> & { name: string }): Promise<Coach> =>
      ipcRenderer.invoke('coaches:upsert', c),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('coaches:delete', id),
    reorder: (idsInOrder: string[]): Promise<void> =>
      ipcRenderer.invoke('coaches:reorder', idsInOrder)
  },
  attendance: {
    getForMonth: (month: string): Promise<AttendanceRow[]> =>
      ipcRenderer.invoke('attendance:getForMonth', month),
    getMonths: (): Promise<string[]> => ipcRenderer.invoke('attendance:getMonths'),
    bulkUpsert: (
      rows: { firstName: string; lastName: string; count: number }[],
      month: string
    ): Promise<{ inserted: number; updated: number }> =>
      ipcRenderer.invoke('attendance:bulkUpsert', rows, month),
    clearMonth: (month: string): Promise<number> =>
      ipcRenderer.invoke('attendance:clearMonth', month)
  },
  on: (channel: PushChannel, cb: PushListener): void => {
    const wrapped = (_e: IpcRendererEvent, data: unknown): void => cb(data)
    listeners.set(cb, wrapped)
    ipcRenderer.on(channel, wrapped)
  },
  off: (channel: PushChannel, cb: PushListener): void => {
    const wrapped = listeners.get(cb)
    if (wrapped) {
      ipcRenderer.off(channel, wrapped)
      listeners.delete(cb)
    }
  }
}

export type CelebAPI = typeof celebAPI

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('celebAPI', celebAPI)
  } catch (err) {
    console.error(err)
  }
} else {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).celebAPI = celebAPI
}
