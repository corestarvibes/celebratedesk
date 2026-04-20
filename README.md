# CelebrateDesk

A minimalist, cross-platform Electron desktop app that displays people's
birthdays, anniversaries, and custom events as a calm, always-visible
celebration wall. Designed to live on a secondary monitor, a lobby TV, or
just your everyday desktop — beautiful by default, confetti only on the
days that actually deserve it.

Built with electron-vite + TypeScript + Tailwind + SQLite.

---

## Quick start

```bash
npm install
npm run dev
```

> **Note for zsh users (macOS default):** by default, zsh does NOT treat
> `#` as a comment in interactive mode. Don't paste command blocks with
> trailing `# comments` into your terminal — the comment becomes args.
> Either run one line at a time without the suffix, or enable comments
> with `setopt interactive_comments` (add it to `~/.zshrc` to persist).

The first launch creates an empty SQLite database at
`<userData>/events.db`. Add an event via the **+** button in the top bar
(or `Cmd/Ctrl+N`), or import a CSV from **Settings → Data**.

---

## Build distributables

```bash
npm run build          # typecheck + bundle (main/preload/renderer)
npm run package        # build + electron-builder --dir (unpacked)

npm run build:mac      # DMG
npm run build:win      # NSIS installer
npm run build:linux    # AppImage
```

Distributables land in `dist-electron/`.

---

## CSV import format

First row is the header (case-insensitive). Required columns: **name**,
**date**. All others optional.

```csv
name,type,date,recurring,notes,photo_url
Jane Smith,birthday,1990-03-15,true,"Loves chocolate cake",
Bob Jones,anniversary,2015-06-20,true,"10 years this year",
Team Retreat,event,2025-08-01,false,"Book the venue",
```

| Column     | Accepted values                                    | Default                      |
| ---------- | -------------------------------------------------- | ---------------------------- |
| name       | any non-empty string                               | required                     |
| type       | `birthday` / `anniversary` / `event` / `custom`    | `custom` if unknown          |
| date       | `YYYY-MM-DD`                                       | required — validated per row |
| recurring  | `true` / `false` / `yes` / `no` / `1` / `0`        | `true`                       |
| notes      | any string                                         | empty                        |
| photo_url  | `https://…` URL or absolute local path             | empty                        |

Duplicates are detected by **name + date** and updated in place rather
than re-inserted. The import summary is shown as a toast; per-row
validation errors appear beneath the button.

---

## Customizing the Chalk It Pro scraper

The scraper uses **puppeteer-core** against your **system Chrome**
(Chromium / Edge also accepted) — not a bundled Chromium. If Chrome isn't
installed you'll see a toast telling you so; install it and try again.

Open **Settings → Chalk It Pro scraper**:

1. **Username / password** — saved via Electron's `safeStorage`. On Linux
   where encryption is unavailable we fall back to plaintext and warn
   you; decide for your threat model.
2. **Login URL / Members URL** — stored in `electron-store`, editable at
   runtime so Chalk It Pro tweaks don't require a rebuild.
3. **Selectors (advanced)** — CSS selectors for each field. To find them:
   - Open the Members page in Chrome.
   - Right-click a member's row → **Inspect**.
   - In DevTools, right-click the matching DOM node → **Copy → Copy selector**.
   - Paste into the right field in Settings.

| Field                | What it targets                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `usernameField`      | The email / username input on the login page.                                                            |
| `passwordField`      | The password input on the login page.                                                                    |
| `submitButton`       | The login submit button.                                                                                 |
| `memberRow`          | The root element of each row in the members list.                                                        |
| `memberName`         | Inside a row — the name cell.                                                                            |
| `memberBirthday`     | Inside a row — the birthday cell (text or `data-birthday` attribute).                                    |
| `memberAnniversary`  | Inside a row — the anniversary cell.                                                                     |

Hit **Save credentials**, then **Run scrape now** to test. The main log
window (stderr) prints the result.

---

## Adding a new view

1. Create `src/renderer/src/views/MyView.ts` exporting `(ctx: ViewContext) => HTMLElement`.
2. Add one line to `VIEW_REGISTRY` in
   `src/renderer/src/views/viewRegistry.ts`:

   ```ts
   { id: 'myview', label: 'My View', icon: '🌟', component: myView },
   ```

3. That's it — it appears in the bottom nav, the settings slideshow
   picker, and the keyboard nav rotation automatically.

Search for `ADD NEW VIEW HERE` for the registration point.

---

## Adding a new data source

1. Create `src/scrapers/MyScraper.ts` extending `BaseScraper`:

   ```ts
   import { BaseScraper } from './BaseScraper'
   export class MyScraper extends BaseScraper {
     name = 'myscraper'
     protected validateSelectors(config) {
       /* ... */
     }
     async scrape(config, credentials) {
       /* return CelebEvent[] */
     }
   }
   ```

2. Register it in `src/main/scraperRunner.ts` (add a branch that chooses
   your scraper based on `settings.dataSource` or a new source key).
3. Add any new config keys to `src/shared/types.ts` and `src/main/store.ts`
   defaults.

Search for `ADD NEW DATA SOURCE HERE`.

---

## Schema migrations

Every DB change is an additive migration. To add a column:

1. Open `src/main/db.ts`.
2. Append to the `migrations` array:

   ```ts
   { version: 2, sql: `ALTER TABLE events ADD COLUMN color TEXT;` }
   ```

3. Update `src/shared/types.ts` to include the new field.
4. On next launch the DB's `user_version` is checked and pending
   migrations run in order inside a single transaction.

Never edit a previous migration — append new ones.

Search for `ADD NEW MIGRATION HERE`.

---

## Member of the Month

The **Member of the Month** view (⭐ Member in the bottom nav) displays a
rotating slide sequence for the currently-active member:

- **Slide 1** — full-bleed hero photo with the member's name overlaid in one
  of three styles (vertical / diagonal / horizontal). Generated server-side
  by [sharp](https://sharp.pixelplumbing.com/) with SVG compositing, saved
  at print-ready resolution (≥2400×3000) to `<userData>/motm-generated/`.
- **Slides 2..N** — one card per Q&A pair with a brand-colored prefix, the
  answer below, and a small watermark of the member's first name + photo.

Slides auto-advance every 12 seconds. A gold star burst fires when the hero
slide renders (not throttled — fires every time the view opens).

### Managing members

**Settings → Member of the Month**:

- **Add / Edit** — name (required), title, member-since date, photo, name
  style (vertical / diagonal / horizontal), and one or more Q&A pairs (max
  20, answers capped at 500 chars).
- **Generate Preview** renders the overlay inline so you can pick a style
  before saving.
- **Import from .docx** uses [mammoth](https://www.npmjs.com/package/mammoth)
  to extract Q&A. Heuristics run in this order:
  1. **Bold** runs = questions, following normal text = answers
  2. Lines starting with `Q:` / `Question:` and `A:` / `Answer:`
  3. Alternating lines fallback
- **Paste text** uses the same heuristics (minus #1) against a textarea.
- **Set active** button promotes a member to active for the current month;
  only one member is active globally at a time.

### Coach Rotation

**Settings → Coach Rotation** — manage the list of coaches who take turns
picking the Member of the Month. Rotation is deterministic:

```
monthsSinceEpoch = (year - 2024) * 12 + (month - 1)
pickerIndex      = monthsSinceEpoch mod coaches.length
```

Coaches are sorted alphabetically by first name (then full name as
tiebreaker) so the rotation is stable across restarts. The current
month's picker is highlighted in gold; next month's is shown muted. A
collapsible 12-month schedule shows the full upcoming rotation.

Rotation math is pure-function in [src/utils/coachRotation.ts](src/utils/coachRotation.ts)
and fully unit-tested.

---

## Attendance Board

The **Attendance** view (🏆 Attendance in the bottom nav) is a two-column
board showing monthly class counts:

- **🏆 Committed Club** (left, gold) — members with **20+** classes.
- **💪 Consistent Club** (right, teal) — members with **12–19** classes.

Both columns sort by count descending, then alphabetical. The top member
of the Committed Club gets a subtle gold highlight. Font size scales
automatically based on list length (18/15/13px for ≤20 / 21–35 / 36+
entries).

### Importing attendance from ChalkItPro

**Settings → Attendance**:

1. Pick the **month** this CSV covers.
2. Click **Import Attendance CSV…** and pick your export.

The parser handles the non-standard format ChalkItPro exports:

- Leading BOM character — stripped automatically
- Column name `Reserved + Checked-In` — recognized via header aliases
- Trailing whitespace in name cells — trimmed
- Lowercase first names — capitalized with proper handling of hyphens
  (`reed-pahang` → `Reed-Pahang`) and apostrophes (`o'brien` → `O'Brien`)

Preview table shows the row count grouped by tier before confirming. On
import, existing `(firstName, lastName, month)` triples are updated
rather than duplicated.

Month selector in the top-right of the Attendance view lets you browse
historical months. Selection persists in `electron-store` as
`attendanceViewMonth`.

---

## QR Codes

The **QR Codes** view (📱 QR Codes) shows a 2×2 grid on a dark background
with a large QR code per entry. Each card shows:

- Icon (emoji) above the QR
- Label (bold, 20px)
- Muted URL text below

Defaults ship with four entries:

| Icon | Label | Purpose |
|------|-------|---------|
| 🌟 | Google Reviews | — |
| 🎯 | Free Trial Class | ChalkItPro drop-in booking |
| 📸 | Photo Library | Google Drive folder |
| 💊 | Thorne Dispensary | Supplement referral |

Edit them in **Settings → QR Codes**. Each entry has an emoji picker,
label, URL input with live preview (500ms debounce), and a "include in
slideshow" toggle. Settings are stored as `qrCodes` in `electron-store`.

QR code rendering is done client-side in the renderer via
[qrcode](https://www.npmjs.com/package/qrcode) — no server roundtrip.

---

## Keyboard shortcuts

| Shortcut         | Action                       |
| ---------------- | ---------------------------- |
| `Space`          | Play / pause slideshow       |
| `←` / `→`        | Previous / next view         |
| `R`              | Refresh (run scraper)        |
| `F`              | Toggle fullscreen            |
| `Escape`         | Close modal / exit search    |
| `Cmd/Ctrl + ,`   | Open settings                |
| `Cmd/Ctrl + N`   | New event                    |
| `Cmd/Ctrl + Shift + F` (global) | Toggle fullscreen from anywhere |

---

## Testing

```bash
npm run test        # one-shot
npm run test:watch  # watch mode
```

The date math — the trickiest part of the app — is fully unit-tested in
`src/utils/__tests__/dateHelpers.test.ts`.

---

## Troubleshooting — sharp / mammoth / qrcode

`sharp` is a native module with prebuilt binaries. If you bump Electron
and get `NODE_MODULE_VERSION` mismatches or `Cannot find module '@img/sharp-*'`,
run:

```bash
npm run rebuild
```

`mammoth` and `qrcode` are pure JS and don't need rebuilding.

For packaged builds, `sharp` is already whitelisted in `asarUnpack` inside
`electron-builder.yml` (the `@img` directory too, since sharp loads its
libvips bindings from there at runtime).

---

## Troubleshooting

**"Scraping requires Google Chrome to be installed."**
We use `puppeteer-core` against your system Chrome to avoid bundling
~280 MB of extra Chromium. Install Chrome, Chromium, or Edge, then retry.

**"NODE_MODULE_VERSION N vs M" after updating Electron**
Native modules (`better-sqlite3`) need to match Electron's ABI. Run:

```bash
npm run rebuild
```

This invokes `electron-builder install-app-deps` under the hood.

**"Credential encryption is unavailable on this Linux configuration"**
You'll see this as an amber warning in **Settings → Chalk It Pro scraper**.
It means `safeStorage.isEncryptionAvailable()` returned false — typically
on a headless Linux system without a libsecret-backed keyring. Credentials
will be stored on disk in plaintext; if that's unacceptable, don't use
the scraper on this machine.

**The window doesn't open at all**
Check for native-module errors in the terminal; they typically resolve
with `npm run rebuild`. If the main process crashes, the window never
creates — always check stderr first.

---

## Project layout

```
celebratedesk/
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.cjs
├── postcss.config.cjs
└── src/
    ├── main/             ← Electron main process (DB, scheduler, IPC, CSP)
    ├── preload/          ← contextBridge surface (window.celebAPI)
    ├── renderer/         ← Tailwind UI — views, components, modals
    ├── shared/types.ts   ← shared between main + preload + renderer
    ├── scrapers/         ← BaseScraper + ChalkItProScraper
    └── utils/            ← dateHelpers (tested), csvParser, logger
```

---

## License

MIT.
