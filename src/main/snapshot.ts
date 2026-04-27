// Snapshot mechanics: produce a transactionally-consistent zip of the
// app's userData folder for the sync layer to upload to Drive.
//
// Why this is non-trivial:
// 1. The SQLite DB runs in WAL mode (see db.ts:96), so `events.db` alone
//    isn't a complete snapshot — there can be pending pages in the .wal
//    sidecar. We use better-sqlite3's `db.backup(destPath)` API which
//    produces a single-file checkpointed copy without blocking writers.
// 2. We exclude the regenerable + log directories (`logs/`,
//    `motm-generated/`) so snapshots stay small and don't churn on
//    every Q&A render.
// 3. Writes are atomic — write to `<dest>.tmp` and rename — so a
//    follower polling mid-write never sees a half-baked file.

import { app } from 'electron'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { getDb } from './db'
import { logger } from '@utils/logger'

// We reuse Node's zip support via `archiver` if available, but to avoid a
// new runtime dep we lean on the OS: `zip` (Mac/Linux) is universally
// available, and we ship Mac-only on the writer side. Followers are
// Windows-only and never call this code path.
import { execFileSync } from 'node:child_process'

/** Files / dirs under userData to NOT include in the snapshot. */
const EXCLUDE_PATTERNS = [
  'logs', // own log file — not worth syncing, grows unboundedly
  'motm-generated', // sharp-rendered overlays, regenerable on the follower
  'celebratedesk-updater', // electron-updater cache
  '.last-applied.json', // follower-side bookkeeping
  '.previous-userData.zip' // follower-side rollback copy
]

export interface SnapshotResult {
  zipPath: string
  manifestPath: string
  sha256: string
  bytes: number
  timestamp: number
}

/**
 * Build a snapshot zip + manifest at the given destination directory.
 * Atomic: writes <dest>/snapshot.zip.tmp and <dest>/snapshot.json.tmp
 * first, then renames once both are on disk.
 *
 * @param destDir absolute path of a directory the caller has confirmed exists
 * @returns metadata about the snapshot (path, sha, size, timestamp)
 */
export async function createSnapshot(destDir: string): Promise<SnapshotResult> {
  if (!existsSync(destDir)) {
    throw new Error(`snapshot dest dir does not exist: ${destDir}`)
  }

  const userData = app.getPath('userData')
  const stagingRoot = join(tmpdir(), `celebratedesk-snapshot-${Date.now()}`)
  const stagingApp = join(stagingRoot, 'celebratedesk')
  mkdirSync(stagingApp, { recursive: true })

  try {
    // Step 1: db.backup() produces a checkpointed single-file copy. This
    // is the ONLY safe way to copy the DB while writers might be active.
    const liveDb = getDb()
    const dbDest = join(stagingApp, 'events.db')
    if (liveDb) {
      await liveDb.backup(dbDest)
    } else {
      // DB hasn't been opened yet — copy the file as-is. Should be rare.
      const srcDb = join(userData, 'events.db')
      if (existsSync(srcDb)) copyFileSync(srcDb, dbDest)
    }

    // Step 2: copy everything else (settings JSON, photo dirs) recursively,
    // skipping excluded paths.
    copyTreeFiltered(userData, stagingApp, [
      ...EXCLUDE_PATTERNS,
      'events.db',
      'events.db-wal',
      'events.db-shm' // already handled via db.backup() above
    ])

    // Step 3: zip the staging tree. Use the OS `zip` command for speed and
    // because we'd rather not pull in a new node-side dep for one feature.
    const zipPath = join(destDir, 'snapshot.zip')
    const zipTmp = `${zipPath}.tmp`
    if (existsSync(zipTmp)) rmSync(zipTmp, { force: true })
    execFileSync(
      'zip',
      ['-r', '-q', zipTmp, 'celebratedesk'],
      { cwd: stagingRoot, stdio: 'inherit' }
    )

    // Step 4: hash the zip + write manifest
    const sha256 = await hashFile(zipTmp)
    const stat = statSync(zipTmp)

    const manifestPath = join(destDir, 'snapshot.json')
    const manifestTmp = `${manifestPath}.tmp`
    const manifest = {
      version: 1,
      timestamp: Date.now(),
      sha256,
      bytes: stat.size,
      writerHostname: require('node:os').hostname()
    }
    writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2))

    // Step 5: atomic rename. Order matters — zip first, manifest LAST,
    // so a follower checking the manifest will only see it after the
    // zip is fully on disk.
    renameSync(zipTmp, zipPath)
    renameSync(manifestTmp, manifestPath)

    logger.info(`[snapshot] wrote ${zipPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)

    return {
      zipPath,
      manifestPath,
      sha256,
      bytes: stat.size,
      timestamp: manifest.timestamp
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true })
  }
}

/** Recursively copy `src` into `dest`, skipping any path whose first
 *  segment (relative to `src`) matches an entry in `exclude`. */
function copyTreeFiltered(src: string, dest: string, exclude: string[]): void {
  if (!existsSync(src)) return
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyTreeFiltered(srcPath, destPath, exclude)
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath)
    }
    // skip symlinks etc.
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/** Read a manifest sidecar; returns null if missing/corrupt. */
export function readManifest(path: string): { timestamp: number; sha256: string } | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as { timestamp: number; sha256: string }
    if (typeof parsed.timestamp !== 'number' || typeof parsed.sha256 !== 'string') {
      return null
    }
    return parsed
  } catch (err) {
    logger.warn(`[snapshot] could not read manifest at ${path}: ${(err as Error).message}`)
    return null
  }
}

/** Resolve the relative path of a file inside userData (for tests / debugging). */
export function relativeToUserData(absPath: string): string {
  return relative(app.getPath('userData'), absPath)
}
