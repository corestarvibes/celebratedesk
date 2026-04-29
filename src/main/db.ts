// SQLite setup, migrations, queries. All sync via better-sqlite3.

import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type {
  AttendanceRow,
  CelebEvent,
  Coach,
  MotmMember,
  MotmQA
} from '@shared/types'

interface Migration {
  version: number
  sql: string
}

// ADD NEW MIGRATION HERE — append, never edit previous migrations.
const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('birthday','anniversary','event','custom')),
        date TEXT NOT NULL,
        recurring INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        photo_url TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        lastScraped TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    `
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS members_of_month (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT,
        startDate TEXT,
        photo_url TEXT,
        nameStyle TEXT NOT NULL DEFAULT 'diagonal',
        isActive INTEGER NOT NULL DEFAULT 0,
        activeMonth TEXT,
        qa TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_motm_active ON members_of_month(isActive);

      CREATE TABLE IF NOT EXISTS coach_rotation (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sortOrder INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        count INTEGER NOT NULL,
        month TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(firstName, lastName, month)
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_month ON attendance(month);
    `
  },
  {
    version: 3,
    sql: `
      ALTER TABLE events ADD COLUMN end_date TEXT;
      ALTER TABLE events ADD COLUMN location TEXT;
      ALTER TABLE events ADD COLUMN event_url TEXT;
    `
  },
  {
    version: 4,
    // v1.1.3: Events view enhancements.
    //   times — free-form line shown under the date (e.g. "6:00am, 7:30am, 9:00am")
    //   qr_label — optional override for the QR code label. Falls back to the
    //              auto "Scan to Register / Learn More" if null/empty.
    sql: `
      ALTER TABLE events ADD COLUMN times TEXT;
      ALTER TABLE events ADD COLUMN qr_label TEXT;
    `
  }
]

let db: Database.Database | null = null

export function initDb(): Database.Database {
  if (db) return db
  const path = join(app.getPath('userData'), 'events.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

/** Returns the live DB handle (or null if not yet initialised). The sync
 *  layer uses this to call `db.backup()` for transactionally consistent
 *  snapshots that don't trip the WAL. */
export function getDb(): Database.Database | null {
  return db
}

function runMigrations(d: Database.Database): void {
  const current = (d.pragma('user_version', { simple: true }) as number) ?? 0
  const pending = migrations.filter((m) => m.version > current)
  for (const m of pending) {
    d.exec('BEGIN')
    try {
      d.exec(m.sql)
      d.pragma(`user_version = ${m.version}`)
      d.exec('COMMIT')
    } catch (err) {
      d.exec('ROLLBACK')
      throw err
    }
  }
}

function requireDb(): Database.Database {
  if (!db) throw new Error('db not initialized')
  return db
}

function rowToEvent(row: Record<string, unknown>): CelebEvent {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as CelebEvent['type'],
    date: row.date as string,
    recurring: !!(row.recurring as number),
    notes: (row.notes as string | null) ?? undefined,
    photo_url: (row.photo_url as string | null) ?? undefined,
    source: row.source as CelebEvent['source'],
    lastScraped: (row.lastScraped as string | null) ?? undefined,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    end_date: (row.end_date as string | null) ?? undefined,
    location: (row.location as string | null) ?? undefined,
    event_url: (row.event_url as string | null) ?? undefined,
    times: (row.times as string | null) ?? undefined,
    qr_label: (row.qr_label as string | null) ?? undefined
  }
}

export function getAllEvents(): CelebEvent[] {
  const rows = requireDb().prepare('SELECT * FROM events ORDER BY date ASC').all() as Record<
    string,
    unknown
  >[]
  return rows.map(rowToEvent)
}

export function getEventById(id: string): CelebEvent | null {
  const row = requireDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToEvent(row) : null
}

export function upsertEvent(partial: Partial<CelebEvent>): CelebEvent {
  const d = requireDb()
  const now = new Date().toISOString()
  if (partial.id) {
    const existing = getEventById(partial.id)
    if (existing) {
      const merged: CelebEvent = {
        ...existing,
        ...partial,
        id: existing.id,
        updatedAt: now
      }
      d.prepare(
        `UPDATE events SET name=?, type=?, date=?, recurring=?, notes=?, photo_url=?, source=?, lastScraped=?, end_date=?, location=?, event_url=?, times=?, qr_label=?, updatedAt=? WHERE id=?`
      ).run(
        merged.name,
        merged.type,
        merged.date,
        merged.recurring ? 1 : 0,
        merged.notes ?? null,
        merged.photo_url ?? null,
        merged.source,
        merged.lastScraped ?? null,
        merged.end_date ?? null,
        merged.location ?? null,
        merged.event_url ?? null,
        merged.times ?? null,
        merged.qr_label ?? null,
        merged.updatedAt,
        merged.id
      )
      return merged
    }
  }
  const id = partial.id ?? uuidv4()
  const ev: CelebEvent = {
    id,
    name: partial.name ?? '',
    type: partial.type ?? 'custom',
    date: partial.date ?? new Date().toISOString().slice(0, 10),
    recurring: partial.recurring ?? true,
    notes: partial.notes,
    photo_url: partial.photo_url,
    source: partial.source ?? 'manual',
    lastScraped: partial.lastScraped,
    end_date: partial.end_date,
    location: partial.location,
    event_url: partial.event_url,
    times: partial.times,
    qr_label: partial.qr_label,
    createdAt: now,
    updatedAt: now
  }
  d.prepare(
    `INSERT INTO events (id,name,type,date,recurring,notes,photo_url,source,lastScraped,end_date,location,event_url,times,qr_label,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    ev.id,
    ev.name,
    ev.type,
    ev.date,
    ev.recurring ? 1 : 0,
    ev.notes ?? null,
    ev.photo_url ?? null,
    ev.source,
    ev.lastScraped ?? null,
    ev.end_date ?? null,
    ev.location ?? null,
    ev.event_url ?? null,
    ev.times ?? null,
    ev.qr_label ?? null,
    ev.createdAt,
    ev.updatedAt
  )
  return ev
}

export function deleteEvent(id: string): void {
  requireDb().prepare('DELETE FROM events WHERE id = ?').run(id)
}

export function bulkUpsert(events: Partial<CelebEvent>[]): { inserted: number; updated: number } {
  let inserted = 0
  let updated = 0
  const d = requireDb()
  const txn = d.transaction((list: Partial<CelebEvent>[]) => {
    for (const ev of list) {
      // Duplicate detection: match on name + date
      if (!ev.id && ev.name && ev.date) {
        const match = d
          .prepare('SELECT id FROM events WHERE name = ? AND date = ? LIMIT 1')
          .get(ev.name, ev.date) as { id: string } | undefined
        if (match) {
          upsertEvent({ ...ev, id: match.id })
          updated += 1
          continue
        }
      }
      const existed = ev.id ? getEventById(ev.id) : null
      upsertEvent(ev)
      if (existed) updated += 1
      else inserted += 1
    }
  })
  txn(events)
  return { inserted, updated }
}

export function searchEvents(query: string): CelebEvent[] {
  const q = `%${query.toLowerCase()}%`
  const rows = requireDb()
    .prepare(
      `SELECT * FROM events WHERE lower(name) LIKE ? OR lower(coalesce(notes,'')) LIKE ? ORDER BY date ASC`
    )
    .all(q, q) as Record<string, unknown>[]
  return rows.map(rowToEvent)
}

export function exportAllAsJSON(): string {
  return JSON.stringify(getAllEvents(), null, 2)
}

/** Delete every row in the events table. Returns the count of rows removed. */
export function clearAllEvents(): number {
  const d = requireDb()
  const before = (d.prepare('SELECT COUNT(*) as n FROM events').get() as { n: number }).n
  d.prepare('DELETE FROM events').run()
  return before
}

// ─────────────────── Member of the Month ────────────────────────────────────

function rowToMotm(row: Record<string, unknown>): MotmMember {
  let qa: MotmQA[] = []
  try {
    qa = JSON.parse((row.qa as string) || '[]') as MotmQA[]
  } catch {
    qa = []
  }
  return {
    id: row.id as string,
    name: row.name as string,
    title: (row.title as string | null) ?? undefined,
    startDate: (row.startDate as string | null) ?? undefined,
    photo_url: (row.photo_url as string | null) ?? undefined,
    nameStyle: (row.nameStyle as MotmMember['nameStyle']) ?? 'diagonal',
    isActive: !!(row.isActive as number),
    activeMonth: (row.activeMonth as string | null) ?? undefined,
    qa,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  }
}

export function getAllMotm(): MotmMember[] {
  const rows = requireDb()
    .prepare('SELECT * FROM members_of_month ORDER BY updatedAt DESC')
    .all() as Record<string, unknown>[]
  return rows.map(rowToMotm)
}

/**
 * Returns the MOTM to display right now.
 *
 * Priority order:
 *   1. Member whose activeMonth matches the current calendar month (YYYY-MM
 *      in system local timezone). Lets the user pre-stage future MOTMs:
 *      e.g. on Apr 29 you set May's member to activeMonth=2026-05; that
 *      member is invisible until May 1 when this query starts matching it.
 *   2. Legacy fallback: any member with isActive=1. Covers older data
 *      where the user toggled isActive via the ⭐ button without setting
 *      activeMonth.
 *
 * If multiple members share the same activeMonth, the most recently
 * updated one wins.
 */
export function getActiveMotm(): MotmMember | null {
  const d = requireDb()
  const now = new Date()
  const currentMonth =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const matched = d
    .prepare(
      'SELECT * FROM members_of_month WHERE activeMonth = ? ORDER BY updatedAt DESC LIMIT 1'
    )
    .get(currentMonth) as Record<string, unknown> | undefined
  if (matched) return rowToMotm(matched)

  const legacy = d
    .prepare('SELECT * FROM members_of_month WHERE isActive = 1 LIMIT 1')
    .get() as Record<string, unknown> | undefined
  return legacy ? rowToMotm(legacy) : null
}

export function upsertMotm(partial: Partial<MotmMember>): MotmMember {
  const d = requireDb()
  const now = new Date().toISOString()
  if (partial.id) {
    const existing = d
      .prepare('SELECT * FROM members_of_month WHERE id = ?')
      .get(partial.id) as Record<string, unknown> | undefined
    if (existing) {
      const cur = rowToMotm(existing)
      const merged: MotmMember = {
        ...cur,
        ...partial,
        id: cur.id,
        qa: partial.qa ?? cur.qa,
        updatedAt: now
      }
      d.prepare(
        `UPDATE members_of_month SET name=?, title=?, startDate=?, photo_url=?, nameStyle=?, isActive=?, activeMonth=?, qa=?, updatedAt=? WHERE id=?`
      ).run(
        merged.name,
        merged.title ?? null,
        merged.startDate ?? null,
        merged.photo_url ?? null,
        merged.nameStyle,
        merged.isActive ? 1 : 0,
        merged.activeMonth ?? null,
        JSON.stringify(merged.qa ?? []),
        merged.updatedAt,
        merged.id
      )
      return merged
    }
  }
  const m: MotmMember = {
    id: partial.id ?? uuidv4(),
    name: partial.name ?? '',
    title: partial.title,
    startDate: partial.startDate,
    photo_url: partial.photo_url,
    nameStyle: partial.nameStyle ?? 'diagonal',
    isActive: partial.isActive ?? false,
    activeMonth: partial.activeMonth,
    qa: partial.qa ?? [],
    createdAt: now,
    updatedAt: now
  }
  d.prepare(
    `INSERT INTO members_of_month (id,name,title,startDate,photo_url,nameStyle,isActive,activeMonth,qa,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    m.id,
    m.name,
    m.title ?? null,
    m.startDate ?? null,
    m.photo_url ?? null,
    m.nameStyle,
    m.isActive ? 1 : 0,
    m.activeMonth ?? null,
    JSON.stringify(m.qa),
    m.createdAt,
    m.updatedAt
  )
  return m
}

export function deleteMotm(id: string): void {
  requireDb().prepare('DELETE FROM members_of_month WHERE id = ?').run(id)
}

/** Set one member active for the given month; deactivate all others. */
export function setActiveMotm(id: string, month: string): MotmMember | null {
  const d = requireDb()
  const txn = d.transaction(() => {
    d.prepare('UPDATE members_of_month SET isActive = 0, updatedAt = ? WHERE isActive = 1').run(
      new Date().toISOString()
    )
    d.prepare(
      'UPDATE members_of_month SET isActive = 1, activeMonth = ?, updatedAt = ? WHERE id = ?'
    ).run(month, new Date().toISOString(), id)
  })
  txn()
  const row = d
    .prepare('SELECT * FROM members_of_month WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToMotm(row) : null
}

// ─────────────────── Coach rotation ─────────────────────────────────────────

function rowToCoach(row: Record<string, unknown>): Coach {
  return {
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sortOrder as number,
    createdAt: row.createdAt as string
  }
}

export function getAllCoaches(): Coach[] {
  const rows = requireDb()
    .prepare('SELECT * FROM coach_rotation ORDER BY sortOrder ASC, name ASC')
    .all() as Record<string, unknown>[]
  return rows.map(rowToCoach)
}

function coachSortKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Insert a new coach at the correct alphabetical position (first name, then last). */
export function upsertCoach(partial: Partial<Coach> & { name: string }): Coach {
  const d = requireDb()
  const now = new Date().toISOString()
  if (partial.id) {
    const existing = d
      .prepare('SELECT * FROM coach_rotation WHERE id = ?')
      .get(partial.id) as Record<string, unknown> | undefined
    if (existing) {
      d.prepare('UPDATE coach_rotation SET name = ? WHERE id = ?').run(partial.name, partial.id)
      reorderCoachesAlphabetically()
      const row = d
        .prepare('SELECT * FROM coach_rotation WHERE id = ?')
        .get(partial.id) as Record<string, unknown>
      return rowToCoach(row)
    }
  }
  const id = partial.id ?? uuidv4()
  d.prepare(
    'INSERT INTO coach_rotation (id, name, sortOrder, createdAt) VALUES (?, ?, ?, ?)'
  ).run(id, partial.name, 0, now)
  reorderCoachesAlphabetically()
  const row = d
    .prepare('SELECT * FROM coach_rotation WHERE id = ?')
    .get(id) as Record<string, unknown>
  return rowToCoach(row)
}

export function deleteCoach(id: string): void {
  requireDb().prepare('DELETE FROM coach_rotation WHERE id = ?').run(id)
  reorderCoachesAlphabetically()
}

/** Reassign sortOrder alphabetically (first name, then last as tiebreaker). */
export function reorderCoachesAlphabetically(): void {
  const d = requireDb()
  const rows = d.prepare('SELECT * FROM coach_rotation').all() as Record<string, unknown>[]
  const sorted = rows
    .map(rowToCoach)
    .sort((a, b) => coachSortKey(a.name).localeCompare(coachSortKey(b.name)))
  const upd = d.prepare('UPDATE coach_rotation SET sortOrder = ? WHERE id = ?')
  const txn = d.transaction(() => {
    sorted.forEach((c, i) => upd.run(i, c.id))
  })
  txn()
}

/** Manual reorder — assigns sortOrder by position in the given id list. */
export function reorderCoaches(idsInOrder: string[]): void {
  const d = requireDb()
  const upd = d.prepare('UPDATE coach_rotation SET sortOrder = ? WHERE id = ?')
  const txn = d.transaction(() => {
    idsInOrder.forEach((id, i) => upd.run(i, id))
  })
  txn()
}

// ─────────────────── Attendance ─────────────────────────────────────────────

function rowToAttendance(row: Record<string, unknown>): AttendanceRow {
  return {
    id: row.id as string,
    firstName: row.firstName as string,
    lastName: row.lastName as string,
    count: row.count as number,
    month: row.month as string,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  }
}

export function getAttendanceForMonth(month: string): AttendanceRow[] {
  const rows = requireDb()
    .prepare('SELECT * FROM attendance WHERE month = ? ORDER BY count DESC, firstName ASC')
    .all(month) as Record<string, unknown>[]
  return rows.map(rowToAttendance)
}

export function getAttendanceMonths(): string[] {
  const rows = requireDb()
    .prepare('SELECT DISTINCT month FROM attendance ORDER BY month DESC')
    .all() as { month: string }[]
  return rows.map((r) => r.month)
}

export function bulkUpsertAttendance(
  rows: { firstName: string; lastName: string; count: number }[],
  month: string
): { inserted: number; updated: number } {
  const d = requireDb()
  let inserted = 0
  let updated = 0
  const now = new Date().toISOString()
  const selectStmt = d.prepare(
    'SELECT id FROM attendance WHERE firstName = ? AND lastName = ? AND month = ?'
  )
  const insertStmt = d.prepare(
    'INSERT INTO attendance (id, firstName, lastName, count, month, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const updateStmt = d.prepare(
    'UPDATE attendance SET count = ?, updatedAt = ? WHERE id = ?'
  )
  const txn = d.transaction(
    (list: { firstName: string; lastName: string; count: number }[]) => {
      for (const r of list) {
        const existing = selectStmt.get(r.firstName, r.lastName, month) as
          | { id: string }
          | undefined
        if (existing) {
          updateStmt.run(r.count, now, existing.id)
          updated++
        } else {
          insertStmt.run(uuidv4(), r.firstName, r.lastName, r.count, month, now, now)
          inserted++
        }
      }
    }
  )
  txn(rows)
  return { inserted, updated }
}

export function clearAttendanceForMonth(month: string): number {
  const d = requireDb()
  const before = (d
    .prepare('SELECT COUNT(*) as n FROM attendance WHERE month = ?')
    .get(month) as { n: number }).n
  d.prepare('DELETE FROM attendance WHERE month = ?').run(month)
  return before
}
