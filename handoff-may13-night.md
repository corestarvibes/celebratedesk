# CelebrateDesk — Handoff (May 14 Update)

## TL;DR

Follow-up fixes landed after the May 13 deploy. QR labels/descriptions were truly clipped, not just a Remote Desktop artifact, and MOTM Q&A still needed more breathing room. Local `main` is now ahead of `origin/main` by 3 commits and should be pushed before the next Windows build.

## Current state

**Code:**
- local main at 96c297b (Update package lock)
- origin/main at a1e5c4b (Center QR codes in two rows)
- local main is 3 commits ahead of origin/main:
  - 48089b4 Reduce QR card canvas size
  - de21726 Show fewer MOTM Q&A pairs per slide
  - 96c297b Update package lock
- All fixes from the May 7 iteration session shipped: fit-to-viewport, age corrections, pluralization, MOTM Q&A pagination, Events rebalance + auto-scroll, Month/Week past-date display, QR drop-in card
- QR page now uses 220px rendered QR codes (bitmap still 2x) so labels/descriptions/icons fit in the 3-over-2 layout
- MOTM Q&A now shows 2 Q&A pairs per slide (one row, two columns) so long answers get full slide height

**PC#1 (Nick's user, on desk):**
- Last known deployed build was at a1e5c4b
- Needs `git pull` after pushing local commits, then rebuild
- Built tonight via npm run build:win
- Installer at C:\Users\Nick\Desktop\celebratedesk\dist-electron\celebratedesk-1.1.5-setup.exe (107 MB)
- **PC#1 does NOT have Google Drive client installed.** Original handoff was wrong about this.

**PC#2 (adam's user, gym, drives 4 TVs):**
- v1.1.5 with tonight's fixes installed
- App launching and showing content
- Drive client IS installed and working at G:\My Drive\CelebrateDesk Sync\
- Monitor 4 still misaligned from May 1 admin UAC incident — pending in-person cleanup

**M5 MacBook Pro:**
- Source at /Users/ndimatteo/Desktop/celebratedesk
- npm run dev works for previewing (arm64 native rebuild done)
- package-lock.json is now committed in 96c297b, no longer intentionally dirty

## Deploy lesson learned tonight

**The Drive sync deploy path documented in the May 1 handoff was wrong.**

The May 1 doc said: copy installer to PC#1's G:\My Drive\CelebrateDesk Sync\ to sync via Drive.

Reality discovered tonight: PC#1 has no Drive client. There is no G:\ on PC#1.

**The actual working deploy path is:**

1. Build on PC#1 → installer lands in C:\Users\Nick\Desktop\celebratedesk\dist-electron\
2. On PC#1, open Chrome → drive.google.com (signed into OTG account)
3. Navigate to My Drive > CelebrateDesk Sync (the same folder that contains the May 1 watch.ps1)
4. Drag installer into Chrome web UI
5. **Don't rely on Drive sync pulling it to PC#2.** Drive on PC#2 lagged badly tonight — never pulled the new file even after waiting and process diagnostics.
6. Instead, on PC#2 via Remote Desktop: open Chrome, go to drive.google.com, right-click the installer in the same folder → Download. Saves to C:\Users\adam\Downloads\.

**Then install:**

\`\`\`powershell
Stop-Process -Name "CelebrateDesk" -Force -ErrorAction SilentlyContinue
Unblock-File "C:\Users\adam\Downloads\celebratedesk-1.1.5-setup.exe"
Remove-Item -Recurse -Force "C:\Users\adam\AppData\Local\Programs\CelebrateDesk\"
& "C:\Users\adam\Downloads\celebratedesk-1.1.5-setup.exe"
\`\`\`

Direct download via Chrome bypasses the unreliable Drive sync entirely. About 10x faster than debugging Drive Stream's pull behavior.

## Known issues to verify at gym tomorrow morning

### Issue A — QR Codes view: labels not displaying

Fixed locally in 48089b4 by reducing `QR_PX` from 380 to 220 while keeping the bitmap at `QR_PX * 2`. Needs rebuild/deploy from PC#1 and a gym scan-distance check.

### Issue B — MOTM Q&A still overflowing on some members

Mitigated locally in de21726 by reducing Q&A slides to 2 pairs per slide (one row, two columns). The fit helper floor/scroll fallback is still suspect and should be diagnosed later, but the immediate layout issue should be much less likely after rebuild/deploy.

### Issue C — Monitor 4 still misaligned

Carried over from May 1. Find the displaced window via Alt+Tab on PC#2, use Win+Shift+Arrow to move back to Monitor 4. ~30 seconds in person.

## Gym verification checklist tomorrow

In this order. Bring photos from May 1 AND from earlier tonight's Remote Desktop screenshot on phone for comparison.

1. **Monitor 4 cleanup** — drag displaced window back
2. **Today view** — Casey Klingert's age. Should show "turned 45" or similar, not "turning 46"
3. **Member of the Month** — walk through ALL Q&A slides for current MOTM. Note which members overflow without scroll. Take photos of any that break.
4. **Events view** — verify auto-scroll cycles cleanly, QR stays scannable. Scan with phone to confirm https://app.chalkitpro.com/dropIns/626/3886/x for the Drop-In QR (separate from the Free Trial Class QR).
5. **Attendance** — Committed Club should be multi-column when >5 entries
6. **Week view** — past dates this week showing their events
7. **Month view** — past dates showing events, ages correct
8. **QR Codes page** — labels/descriptions visible for all 5 codes after 48089b4. Scan Drop-In QR at gym viewing distance.

Take fresh photos of every view, including working ones. Reference for future regressions.

## Backlog (next dedicated session)

1. **Fit helper overflow handling** — content exceeding floor scale should engage scroll fallback but can get cut off silently. This still deserves a dedicated diagnosis session with instrumentation.
2. **watch.ps1 em-dash rewrite** — ASCII-only + CI check for non-ASCII bytes in .ps1 files. PC#2 still has local-only patch from May 1.
3. **PC#1 TV setup** — when hardware arrives
4. **Consolidate "Free Trial Class" and "Drop-In" QRs** — both point to chalkitpro.com/dropIns URLs with different IDs. Decide if both are needed, and whether the new hardcoded one should be added to Settings as editable.
5. **Q&A pacing** — after living with 2-per-slide for a week, decide if per-slide duration needs adjustment for members with many Q&As across multiple slides.
6. **Smoke test for fitToViewport** — mount with known overflow, assert scale behavior.

## Useful paths/commands

\`\`\`
M5 source:                 /Users/ndimatteo/Desktop/celebratedesk
M5 dev preview:            npm run dev   (works on arm64)
PC#1 source:               C:\Users\Nick\Desktop\celebratedesk
PC#1 build cmd:            cd C:\Users\Nick\Desktop\celebratedesk; npm run build:win
PC#1 build output:         C:\Users\Nick\Desktop\celebratedesk\dist-electron\celebratedesk-1.1.5-setup.exe
PC#1 has no Drive client — upload installer to Drive via Chrome web

PC#2 install:              C:\Users\adam\AppData\Local\Programs\CelebrateDesk\
PC#2 user data:            C:\Users\adam\AppData\Roaming\celebratedesk\
PC#2 Drive (Stream):       G:\My Drive\CelebrateDesk Sync\
PC#2 sync scripts:         C:\Users\adam\Desktop\celebratedesk-sync\ (NOT a Drive folder, just local)
PC#2 logs:                 C:\Users\adam\AppData\Roaming\celebratedesk\logs\

Remote desktop:            https://remotedesktop.google.com/access
Repo:                      https://github.com/corestarvibes/celebratedesk
\`\`\`

## Don't repeat what didn't work

- **Don't trust Drive sync to push installers to PC#2 in a reasonable time.** Drive Stream on PC#2 is sluggish/unreliable. Use direct Chrome download instead.
- Don't run installers from the Drive sync folder. Copy to Downloads/Desktop, Unblock-File, then install.
- Don't use the PC#2 uninstaller. Use Remove-Item -Recurse -Force on the install directory.
- package-lock.json has been committed in 96c297b to sync lockfile state; don't churn it further unless package metadata changes.
- Don't try to verify layout via Remote Desktop. Perspective and scale don't translate. Verification is in person at TV scale only.
- Don't push to main without git fetch && git status first.
- Don't leave em-dashes or non-ASCII in PowerShell scripts.
- Don't keep iterating on fit helper edge cases without proper instrumentation. The next round needs logging + diagnosis, not more guessed fixes.

---

You shipped tonight. The build is live on PC#2. Tomorrow morning: drive to gym, fix Monitor 4, verify everything, take photos, note the remaining bugs in person. You're closer to done than the morning suggested.
