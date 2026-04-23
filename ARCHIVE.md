# CelebrateDesk — Build Archive

Historical log of features shipped, bugs fixed, and decisions made. Active
working context lives in [CLAUDE.md](CLAUDE.md).

---

## Session 1 (April 2026) — Initial scaffold through full signage build

### Scaffold + foundation
- Scaffolded with `npm create @quick-start/electron@latest celebratedesk -- --template vanilla-ts` as a sibling to the ZeusOS project.
- Added deps: `better-sqlite3`, `canvas-confetti`, `date-fns` + `date-fns-tz`, `electron-store`, `electron-updater`, `node-cron`, `puppeteer-core`, `uuid`, vitest, Tailwind + PostCSS.
- Pinned `electron-store@^8` and `uuid@^9` for CJS compatibility (later versions are ESM-only).
- Tailwind/PostCSS configs use `.cjs` extensions to silence the ESM warning without changing package type.
- `electron-vite.config.ts` has explicit aliases for `@shared`, `@utils`, `@scrapers`, `@renderer`.

### First-pass feature set
- **Data model** — migration 1 creates `events` table with `(name, type, date, recurring, notes, photo_url, source, lastScraped, createdAt, updatedAt)`. UUID IDs. Indexes on `date` and `type`.
- **Preload contract** — full `window.celebAPI.*` surface defined upfront: `db`, `scraper`, `settings`, `credentials`, `system`, plus `on`/`off` for push channels (`scrape-complete`, `day-changed`, `update-available`).
- **Views** — TodayHighlight, WeeklyView, MonthlyCalendar, UpcomingList, PeopleGallery registered in `viewRegistry.ts`.
- **Confetti** — canvas-confetti integration (later replaced).
- **Scraper** — BaseScraper abstract + ChalkItProScraper using puppeteer-core + system Chrome (not bundled Chromium, saves ~280MB).
- **CSV import** — row-level validation errors, header aliases, BOM strip, trim everywhere, `true/false/1/0/yes/no` all accepted.
- **Settings modal** — Appearance, Branding (logo upload, accent color), Slideshow, Notifications, Data (import/export), Scraper config.
- **CSP** — locked-down defaults, `file:` in img-src for logos.

### Early bugs + fixes
- **zsh `#` comment paste issue** — README had `npm run dev # launch` blocks that broke because zsh interactive mode doesn't treat `#` as a comment. Stripped comments from copy-pasteable blocks.
- **DB locked native-module mismatch** — `better-sqlite3` needed rebuild against Electron's Node ABI after Electron version bump. Documented `npm run rebuild` as the fix.
- **CSV parser produced "0 new, 0 updated, 1 error"** — root cause was Numbers/Excel prepending a `Table 1` title row. Added `MAX_PREAMBLE=5` header-row scan that skips up to 5 non-blank preamble lines.
- **Attendance CSV path was misrouted through events parser** — added smart error message redirecting users to Settings → Attendance when a ChalkItPro attendance shape is detected by the events parser.

### MOTM / Coaches / Attendance / QR features
- Migration 2 added `members_of_month`, `coach_rotation`, `attendance` tables + indexes.
- Installed `sharp` (asarUnpack'd) for server-side SVG name overlays on MOTM photos — three styles: vertical (letters down each edge), diagonal (italic top-left/bottom-right), horizontal (single line across top). Upscales to ≥2400×3000 for print.
- Installed `mammoth` for .docx Q&A import with three heuristics: bold-HTML, prefixed-lines (`Q:`/`A:`), alternating-lines.
- Installed `qrcode` for client-side QR rendering in views + settings editor.
- Coach rotation math in pure functions (`coachRotation.ts`) — deterministic via `monthsSinceEpoch % coaches.length`. Unit-tested with 13 cases.
- Attendance CSV parser handles the non-standard ChalkItPro export format (BOM, trailing spaces, lowercase names, `Reserved + Checked-In` header).
- QRCodesView seeded with 4 defaults (Google Reviews, Free Trial, Photo Library, Thorne).
- Settings gained MOTM manager (add/edit/delete members + inline photo picker + Q&A editor with import), Coaches (add + rotation schedule), Attendance import, QR Codes editor.

### Electron 39 compatibility issues
- **`protocol.registerSchemesAsPrivileged` + `celeb-local://`** — Chromium blocks `file://` URLs from the renderer's `http://localhost:5173` origin in dev. Registered a custom privileged scheme (`standard: true, secure: true, bypassCSP: true, stream: true, supportFetchAPI: true`) that serves local files via `net.fetch(pathToFileURL(path))` from the main process. Needed a dummy host `celeb-local://f/...` because standard schemes require an authority, and Chromium lowercases the first path segment as the host otherwise.
- **`app.disableHardwareAcceleration()`** — macOS + Electron combinations silently drop canvas compositing. Falling back to software rendering fixes confetti not appearing.
- **canvas-confetti replaced with hand-rolled** — the library sized its own canvas to 1200px in a 645px window, putting particles off-screen. Hand-rolled implementation creates its own canvas sized to `window.innerWidth/Height`, runs a rAF loop with particles (squares / circles / stars mixed).
- **`File.path` removed in Electron 39+** — drag-drop file paths now go through preload-exposed `webUtils.getPathForFile(file)`.

### Settings migration system
- Introduced `migrateSettings()` that runs on main startup. Handles:
  - `slideshowViews` — detects removed view IDs (`gallery`, `upcoming`) and resets to current defaults when stale.
  - `accentColor` — resets legacy amber `#f59e0b` to brand blue `#38bdf8`, preserves custom overrides.
  - `scraperConfig.selectors` — replaces legacy single-value selectors (`#email`, `#password`, `.member-row`) with multi-selector CSS lists.
  - `qrCodes` — appends any missing default entries by id.

### OTG brand rebrand
- All amber/gold swapped to `#38bdf8` (OTG sky blue). Warning colors (semantic amber) intentionally preserved.
- Confetti palette: blue + white + pinks/greens for variety. Star burst: blue palette + mixed stars/circles shapes.
- Attendance Committed Club header: solid brand-blue pill. Consistent Club: solid slate-600.
- Month pills, MOTM banner/labels, Events accent line, bottom-nav active indicator all pull brand blue.

### Events feature (new table additions + view redesign)
- Migration 3 added `end_date`, `location`, `event_url` columns to `events`.
- EventsView v1: MOTM-style banner header + vertical stack of event details.
- EventsView v2 (redesigned to high-end digital signage aesthetic):
  - 65/35 horizontal split — photo left, anthracite sidebar right.
  - Blurred-backdrop technique (same image cover-scaled + blurred) fills the letterbox so `object-contain` portraits don't get harsh black bars.
  - 3px brand-blue vertical accent line between the halves with `box-shadow` glow.
  - Bebas Neue event name (`clamp(48px, 4.8vw, 84px)`), Montserrat details.
  - `COMING UP · IN N DAYS` / `HAPPENING TODAY 🎉` top badge.
  - Optional `📅 date range / 📍 location / notes` (5-line clamp with mask-image fade).
  - `SCAN TO REGISTER` / `SCAN TO LEARN MORE` label + 160×160 QR (auto-switches based on URL).
  - Logo top-left at 0.7 opacity. Dot indicators bottom-center for multi-event.
- Animated gradient fallback when no photo is set (8s ease-in-out navy→slate shift, `20vw` type watermark at 5% opacity).
- Google Fonts loaded (Bebas Neue + Montserrat) — CSP updated on both `<meta>` and the main-process header.
- Events-specific `system:saveEventPhoto` IPC + EventFormModal picker UX (thumbnail + button + optional URL-paste `<details>`) matching MOTM.
- EventsView slide-advance hook wired into main slideshow (like MOTM).
- Settings → Events section (list, add, edit, delete, inline metadata).

### MOTM Q&A evolution
- Started at 2-per-column (4 pairs per slide), bumped to 4-per-column (8 pairs per slide) with font tuning.
- Added on-view auto-detect for swapped pairs (heuristic: answers ending in `?` OR questions 1.6× longer than answers) with a tap-to-fix button that upserts swapped pairs to DB.
- Per-pair `↕` swap in the form editor's pair header alongside `↑ ↓ ✕`.
- Bulk `Swap Q↔A for all members` + `Clean Q:/A: prefixes` buttons in the MOTM section of Settings.
- Docx parser reordered — `tryPrefixedLines` (highest confidence, unambiguous) runs **before** `tryBoldHtml`. Fixed a real bug where a user's `Q: …` non-bold / `A: …` bold doc was parsed with answers-as-questions.
- Full-width top banner with member name between stars: `⭐ LANCE ULRICH ⭐` (matches hero slide style). Removed the bottom-right watermark.

### ChalkItPro CSV integration
- Auto-detection in the main `parseCsv` — if headers include `First Name` + `Last Name` + (`Birth Date` or `Member Since`), dispatches to `parseChalkitMembers()`.
- Tab vs comma auto-detected (ChalkItPro exports TSV despite `.csv` extension).
- `MM/DD/YY` with pivot-at-30: `YY 00-29 → 20YY`, `30-99 → 19YY`.
- One CSV row → up to 2 events (birthday + anniversary).
- Rolling-window import filter — `fromDate` option in `db:importCSV` IPC, UI defaults to the start of the current month so past-this-month events are skipped.
- Drag-and-drop zones in Settings → Data (Events) and Settings → Attendance. Uses `webUtils.getPathForFile()` via preload.

### Scraper deferred
- ChalkItPro login wasn't working — their login page is a two-step React flow with reCAPTCHA (Stax captcha + Google GSI). Scraper got as far as detecting the two-step flow, typing email, pressing Enter, typing password, but login repeatedly failed on their side (actual credential issue the user reported). Deferred to manual CSV import.
- Scheduled scrape cron now gated on `settings.dataSource === 'scrape'` so CSV/manual users don't trigger background scrape attempts.

### TV-legibility pass
- All views scaled up for 50–55" TV viewing distance.
- Today: hero cards with 32×32 avatars, `clamp(48px, 7vw, 88px)` names.
- Week: tight cards bumped to 26px names.
- Month: 22px day numbers, 15px pills.
- Attendance: dynamic font scaling (36px → 14px curve) + auto-split into 2–3 sub-columns when >20 rows so no scrolling needed.
- Upcoming view removed (redundant with Week + Month).
- People/Gallery view removed (redundant with Month view for members).
- QR Codes switched from 2×2 to 1×4 single row.

### Test coverage
- `utils/__tests__/dateHelpers.test.ts` — 30 tests (Feb 29 / leap / recurring / past-date edge cases).
- `utils/__tests__/coachRotation.test.ts` — 13 tests (sort, pivot, pickers, rotation schedule, month math).
- `utils/__tests__/csvParser.test.ts` — 23 tests (canonical events, ChalkItPro format, preamble skip, date pivot).
- `utils/__tests__/attendanceCsvParser.test.ts` — 7 tests (capitalize, BOM, preamble).

### Final state at session end
- **73/73 tests passing**, `npm run build` clean, `npm run dev` launches and renders all views.
- **Database:** migration 3 is current. Schema supports events (with end_date/location/event_url), MOTM, coaches, attendance.
- **Brand:** fully OTG blue. Bebas Neue + Montserrat loaded via Google Fonts.
- **Views:** Today · Member · Events · Attendance · Week · Month · QR Codes — 7 tabs in both nav and slideshow rotation.
- **Scraper:** disabled in practice; CSV import is the primary data path.
- Drag-drop fix shipped pending user verification after restart.
