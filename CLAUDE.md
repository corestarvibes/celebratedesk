# CelebrateDesk — Claude Code Context

A minimalist Electron desktop app for OTG (Optimal Training Gym) — a digital
celebration wall for a 50-55" TV in the lobby. Cycles through birthdays,
anniversaries, Member of the Month, Events, Attendance leaderboards, and QR
codes.

Historical detail and per-feature decisions live in [ARCHIVE.md](ARCHIVE.md).
This file is the active working context.

## Stack

- **electron-vite** scaffold · TypeScript · Tailwind (via PostCSS, `.cjs`
  configs) · hand-rolled canvas confetti (canvas-confetti was replaced —
  its internal resize logic mis-sized the canvas in Electron)
- **better-sqlite3** for persistence (`<userData>/events.db`)
- **electron-store** for settings (defaults + `migrateSettings()` at launch)
- **sharp** for Member-of-the-Month name-overlay generation
- **mammoth** for MOTM .docx Q&A import
- **qrcode** for QR rendering
- **puppeteer-core** for the (currently unused) ChalkItPro scraper

Run `ls` or `FOLDER_STRUCTURE.md`-style: key entrypoints below.

## Brand

- **OTG brand blue:** `#38bdf8` · all amber/gold references swapped.
- `--brand-primary` in `src/renderer/src/styles/theme.css`; everything else
  pulls via `var(--brand-primary)` or explicit hardcoded value. Warning
  colors (semantic amber) intentionally stay amber.
- `applyTheme()` in `TopBar.ts` applies dark mode + sets the CSS var from
  `settings.accentColor`.

## Hard rules / conventions

- **DB migrations are additive only.** Append to `migrations` array in
  `src/main/db.ts`. Current version: **3**. Never edit a previous
  migration. Integrity validated at launch.
- **Views that cycle internally expose `{viewId}Advance(): boolean` and
  `{viewId}Reset(): void`** — main slideshow calls `Advance()` on each tick
  while on that view; `false` returned ⇒ move to next view. Currently used
  by MOTM and Events views. Reset called on leaving.
- **Image display paths route through `fileUrl()`** which emits
  `celeb-local://f/…` — custom Electron protocol registered in
  `main/index.ts` that serves files from disk. `file://` URLs are blocked
  by Chromium for the renderer's http origin.
- **Drag-and-drop file paths use `webUtils.getPathForFile(file)`** via
  preload (File.path was removed in Electron 39+).
- **Hardware acceleration disabled** — `app.disableHardwareAcceleration()`
  before `app.whenReady()`. Some macOS/Electron combinations silently drop
  canvas layers with GPU compositing on.
- **CSP in two places** — HTML `<meta>` (dev) and
  `src/main/csp.ts` (production header). Currently allows
  `celeb-local:`, `https://fonts.googleapis.com`, `https://fonts.gstatic.com`.

## Data model

Shared types in `src/shared/types.ts`. SQLite tables:

| Table | Purpose |
|---|---|
| `events` | Birthdays, anniversaries, custom events. Columns added in migration 3: `end_date`, `location`, `event_url` (QR source). |
| `members_of_month` | MOTM records — name, photo, nameStyle, Q&A JSON array, isActive + activeMonth. |
| `coach_rotation` | Coach names with sortOrder for deterministic monthly picker rotation. |
| `attendance` | Per-month class counts — `(firstName, lastName, month)` UNIQUE. |

## Views

Registered in `src/renderer/src/views/viewRegistry.ts` — order here is both
the bottom-nav order and the default slideshow order. Removed views:
`gallery`, `upcoming` (tracked in `REMOVED_VIEW_IDS` for migration).

| ID | File | What |
|---|---|---|
| `today` | TodayHighlight.ts | Hero cards for `daysUntil === 0`; fires confetti once per day. |
| `motm` | MemberOfMonthView.ts | Banner + photo + 8-per-slide Q&A grid. Auto-detects swapped Q/A with inline fix button. |
| `events` | EventsView.ts | 65/35 split: blurred-backdrop photo left, anthracite sidebar right (event name in Bebas Neue, details, optional QR). One event per slide. |
| `attendance` | AttendanceView.ts | Two-column leaderboard — Committed Club (20+) vs Consistent Club (12-19). Auto-splits into 2-3 sub-columns when >20 rows. Defaults to previous month. |
| `weekly` | WeeklyView.ts | 7-column grid, one day per column, tight event cards. |
| `monthly` | MonthlyCalendar.ts | Full calendar grid, solid brand-blue pills for event days. |
| `qrcodes` | QRCodesView.ts | Single row of 4 (1x4 grid) — emoji + QR + label. |

## Typography

- Standard UI: Inter (system) via Tailwind base.
- Events + Signage: **Bebas Neue** (`.font-display`) + **Montserrat**
  (`.font-ui`) via Google Fonts (CSP allows fonts.googleapis.com +
  fonts.gstatic.com). Loaded in `index.html`.

## Where things live

- **Main IPC** — `src/main/index.ts` registers every `ipcMain.handle`.
  ADD NEW IPC CHANNEL HERE.
- **Preload surface** — `src/preload/index.ts` → `window.celebAPI.*`.
  Mirrors IPC 1:1.
- **Settings modal** — `src/renderer/src/modals/SettingsModal.ts` + most
  section builders in `modals/settingsSections.ts` (MOTM, Coaches,
  Attendance, Events, QR Codes). Scraper section stays in SettingsModal.
- **Parsers** — `src/utils/csvParser.ts` (auto-detects ChalkItPro members
  format + TSV + MM/DD/YY), `src/utils/attendanceCsvParser.ts` (BOM +
  trim + capitalize), `src/main/docxParser.ts` (Q:/A: prefixes first,
  bold second, alternating last).
- **Sharp overlay** — `src/main/motmOverlay.ts` (three styles:
  vertical/diagonal/horizontal).
- **Coach rotation math** — `src/utils/coachRotation.ts` pure functions,
  unit-tested.

## Commands

```
npm run dev         # electron-vite dev
npm run build       # typecheck + bundle (main, preload, renderer)
npm test            # vitest — 73/73 passing
npm run rebuild     # electron-builder install-app-deps (native modules)
```

## Current status

**Build green, 73/73 tests passing.** All major features shipped.

Recently completed:
- ChalkItPro members-export CSV parser (TSV, MM/DD/YY, First+Last → name,
  Birth Date + Member Since → birthday + anniversary events per row).
- Rolling-window import filter (`fromDate` option) — defaults to current
  month so April+ events are kept, past-this-month skipped.
- Drag-and-drop zones for both CSV imports using
  `webUtils.getPathForFile()`.
- Attendance view + import default to **previous month** (ChalkItPro
  attendance runs a month behind).
- Q&A on-view auto-detect + fix button for reversed pairs.
- In-form per-pair `↕` swap, bulk-swap-all-members, and "Clean Q:/A:
  prefixes" buttons in Settings.
- Events view redesigned as high-end signage: 65/35 split, blurred
  backdrop + letterboxed main image, cinema-poster aesthetic, Bebas Neue
  name, brand-blue accent line + glow, 1x4 QR grid.

## Known issues / deferred

- **ChalkItPro scraper is non-functional.** Their login page uses a
  two-step flow + reCAPTCHA + GSI — automated login won't pass. User
  deferred to manual CSV import. The scraper section still exists in
  Settings in case ChalkItPro changes or an API path is added. Scheduled
  scrape cron is gated on `settings.dataSource === 'scrape'`.
- **MOTM parser** — three heuristics (prefixed / bold / alternating) run
  in order; works well for the OTG .docx format (non-bold `Q:` +
  bold `A:`). If a new member's doc doesn't follow this pattern the
  auto-detect swap button catches the common flip case.
- **Q&A font sizing** — currently 8 pairs per slide (4×2 grid) at
  34px question / 26px answer. Auto-scroll handles overflow.

## Next steps when user returns

User was debugging a drag-drop file-path issue on a recent Electron build;
fix was just shipped (use `webUtils.getPathForFile()` in preload). Next
likely items:
- Verify drag-drop now works after the webUtils fix.
- Finish polishing the Events view with real photos.
- Production packaging (`npm run build:mac`) for deployment to gym TV.

## When in doubt

- `FOLDER_STRUCTURE.md` (implicit — derived from the file tree) is the
  canonical layout.
- Schema edits: append a new migration to `src/main/db.ts`.
- Brand color edits: change `--brand-primary` in `theme.css` only. Custom
  `settings.accentColor` values override the CSS var at runtime.
- New view: add entry to `VIEW_REGISTRY` + create the file in
  `src/renderer/src/views/`. Optional: `{viewId}Advance`/`{viewId}Reset`
  exports if it internally cycles.
- New IPC channel: `src/main/index.ts` + `src/preload/index.ts` in the
  same commit.
