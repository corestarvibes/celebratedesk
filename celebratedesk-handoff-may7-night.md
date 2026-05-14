# CelebrateDesk — Handoff (May 7 Night, mid-deploy)

## TL;DR

Long iteration session with Codex landed layout, age-display, MOTM Q&A, Events, and QR fixes on M5 `main`. This file is now historical; see `handoff-may13-night.md` for the current May 14 state. Local `main` currently includes follow-up commits through `96c297b`.

## Current state

**M5 MacBook Pro:**
- local `main` is ahead of `origin/main`
- `package-lock.json` is committed in `96c297b`
- Latest local commit: `96c297b` "Update package lock"
- Dev environment working (`npm run dev` runs locally on arm64)

**Commits in this batch (oldest to newest):**
```
5890895 Show past weekly events
6948a44 Rebalance events view with auto-scroll
1f48fb5 Correct displayed milestone ages
7b35ae0 Refit MOTM Q&A on slide changes
6d67cb4 Pluralize milestone year labels
222291b Reduce MOTM Q&A pairs per slide (8 → 4)
5eb50da Tune MOTM Q&A slide cap (4 → 6, didn't fit)
6d4c1eb Restore MOTM Q&A slide cap (6 → 4, final)
e96e9f7 Add drop-in QR card
a1e5c4b Center QR codes in two rows
48089b4 Reduce QR card canvas size
de21726 Show fewer MOTM Q&A pairs per slide
96c297b Update package lock
```
Plus 8 earlier commits from the previous evening (fit helper + initial view fixes).

**PC#1:** Untouched today. Still on the last build from May 1. Needs `git pull`, `npm install`, `npm run build:win`.

**PC#2:** Currently running v1.1.5 with patches from May 1. Showing May content. Monitor 4 still misaligned from the admin UAC incident on May 1 (30-second window-management fix pending).

## What got fixed this session

1. **Today view** — names + avatar capped, fit-to-viewport as safety net
2. **MOTM Q&A** — 2 pairs per slide cap, refit on slide change, fit-to-viewport with `minScale: 0.72` and scroll fallback
3. **Events view** — rebalanced to 70/30 details/shirts, auto-scroll on overflow, QR stays full-size, default image placeholder when no shirt design
4. **Attendance** — Committed Club now multi-column when >5 entries (parity with Consistent Club)
5. **Month calendar** — past dates in displayed month now show their events (was the bug where May 1, 2, 3, 5 looked blank)
6. **Week view** — same date-filter fix as Month
7. **Ages** — birthday/anniversary ages now compute from displayed occurrence date, not next-occurrence. "Turned N" for past, "turning N" for future. Pluralization fixed ("1 year" not "1 years")
8. **QR drop-in feature** — new card on QR Codes page, hardcoded URL `https://app.chalkitpro.com/dropIns/626/3886/x`, layout rebalanced to two rows

## Known issues NOT fixed in this batch

- **Fit helper overflow handling is unreliable.** When content exceeds the floor scale, helper neither scrolls nor fails visibly — content gets cut off silently. This is why the MOTM Q&A cap had to be hand-tuned to 2 instead of trusting the helper to handle 6+. Worth a dedicated diagnosis session later. Not blocking ship.
- **Em-dash in `watch.ps1`** — local PC#2 patch still in place from May 1. Not propagated to GitHub. Only matters if PC#2 re-downloads the file. Robust fix: rewrite ASCII-only + add CI check for non-ASCII bytes in `.ps1` files. Skipped tonight.
- **Monitor 4 alignment** on PC#2 — window-management cleanup, ~30 seconds, in person or via Remote Desktop.
- **PC#1's eventual TV** — not yet acquired/mounted.

## Next actions in order

### 1. Push from M5

```
cd /Users/ndimatteo/Desktop/celebratedesk
git status                        # confirm only expected handoff/doc files are dirty
git log --oneline origin/main..HEAD   # confirm 18 commits ahead
git push origin main
```

`package-lock.json` has now been committed in `96c297b` to sync the lockfile. Avoid further lockfile churn unless dependencies/package metadata change.

### 2. Build on PC#1

Chrome Remote Desktop to PC#1:

```
cd C:\Users\Nick\Desktop\celebratedesk
git fetch
git pull
npm install
npm run build:win
```

Build output: `C:\Users\Nick\Desktop\celebratedesk\dist-electron\celebratedesk-1.1.5-setup.exe`

Note: PC#1's `postinstall` runs `electron-builder install-app-deps --arch=x64` which is correct for Windows. Native modules will rebuild for x64 automatically.

### 3. Sync installer to PC#2 via Drive

On PC#1, copy installer to `G:\My Drive\CelebrateDesk Sync\`. Wait for Drive Desktop to sync (~30 seconds).

### 4. Install on PC#2

Chrome Remote Desktop to PC#2. **Critical steps from May 1's "don't repeat what didn't work":**

```powershell
# Copy installer OUT of Drive sync folder to Desktop first
Copy-Item "C:\Users\adam\Desktop\celebratedesk-sync\celebratedesk-1.1.5-setup.exe" "C:\Users\adam\Desktop\"

# Unblock the file (defender/MOTW)
Unblock-File "C:\Users\adam\Desktop\celebratedesk-1.1.5-setup.exe"

# DO NOT use the uninstaller — it fails NSIS integrity check on itself
# Manually remove install directory instead
Remove-Item -Recurse -Force "C:\Users\adam\AppData\Local\Programs\CelebrateDesk\"

# Then install
& "C:\Users\adam\Desktop\celebratedesk-1.1.5-setup.exe"
```

Don't run installers directly from the Drive sync folder — Defender or Drive locking caused integrity errors on May 1.

### 5. Quick remote-desktop sanity check

Just confirm the app launches and shows current content on PC#2. **Don't try to verify layout via Remote Desktop** — perspective and scale don't translate. Real verification is in person tomorrow.

### 6. Gym verification (morning)

Walk these in order. Bring May 1 photos on phone for before/after comparison.

- **Monitor 4 cleanup** (Alt+Tab on PC#2, find displaced window, `Win+Shift+Arrow` to move back to Monitor 4)
- **Today view** — Casey's age should now be correct (45 turned, not turning 46)
- **Member of the Month** — verify both Q&A slides fit, no cut-off mid-sentence
- **Events** — verify auto-scroll cycles cleanly, QR stays scannable at full size, scan with phone to confirm URL works
- **Attendance** — Committed Club shows multiple columns when >5 entries
- **Week view** — past dates this week show their events
- **Month view** — past dates show events, ages correct
- **QR Codes page** — new drop-in card visible, scan to verify URL: `https://app.chalkitpro.com/dropIns/626/3886/x`. Existing QRs not visually broken by the rebalance.

Take fresh photos of every view, even working ones. Reference for future regressions.

## Useful paths/commands

```
M5 source:                 /Users/ndimatteo/Desktop/celebratedesk
M5 dev:                    npm run dev   (works on arm64 after `npm rebuild`)
PC#1 source:               C:\Users\Nick\Desktop\celebratedesk
PC#1 build output:         C:\Users\Nick\Desktop\celebratedesk\dist-electron\celebratedesk-1.1.5-setup.exe
PC#1 Drive folder:         G:\My Drive\CelebrateDesk Sync\
PC#2 install:              C:\Users\adam\AppData\Local\Programs\CelebrateDesk\
PC#2 sync folder:          C:\Users\adam\Desktop\celebratedesk-sync\
PC#2 logs:                 C:\Users\adam\AppData\Roaming\celebratedesk\logs\

Build (PC#1):              cd C:\Users\Nick\Desktop\celebratedesk && npm run build:win
Sync log:                  Get-Content "$env:APPDATA\celebratedesk\logs\sync.log" -Tail 30
Remote desktop:            https://remotedesktop.google.com/access
Repo:                      https://github.com/corestarvibes/celebratedesk
```

## Don't repeat what didn't work

- Don't run installers from the Drive sync folder. Copy to Desktop, `Unblock-File`, then install.
- Don't use the PC#2 uninstaller. Use `Remove-Item -Recurse -Force` on the install directory.
- `package-lock.json` is committed in 96c297b; don't churn it further unless package metadata changes.
- Don't try to verify layout via Remote Desktop — perspective and scale don't translate.
- Don't push to main without `git fetch && git status` first.
- Don't leave em-dashes or any non-ASCII in PowerShell scripts (still a latent issue in `watch.ps1`).

## Backlog (next session, not tonight)

1. Diagnose fit helper overflow handling — content exceeding floor scale should engage scroll fallback but currently gets cut off silently. Dedicated session.
2. Rewrite `watch.ps1` ASCII-only, push, add CI check for non-ASCII bytes.
3. PC#1's TV setup when hardware arrives.
4. Smoke test for `fitToViewport` helper (mount with known overflow, assert scale behavior).
5. Consider whether Q&A 2-per-slide pacing is right after living with it for a week. If a member has 8 Q&As, 4 slides may need longer total MOTM dwell time.

---

You went from "Bug 3 is a blocker, font scaling is broken everywhere" this morning to a clean working build with the QR feature shipped. Push, build, deploy, sleep.
