# CelebrateDesk — Deployment & Update Runbook

Everything you need to get the app onto the gym's mini PC(s) and keep it up
to date remotely. Mac install instructions for your dev machine are in
Part 8.

> **Content sync** is in v1.1.0+. The Mac is the writer; mini PCs are
> read-only followers. Edit content on the Mac → it auto-pushes to a
> Drive folder → mini PCs poll every minute and apply the latest
> snapshot. See **Part 9 — Content sync** below for setup. (Code
> updates, separately, still flow through GitHub Actions and
> electron-updater on Windows; auto-update is manual on Mac.)

---

## The mental model

Three moving parts:

1. **Your Mac** — where you edit code and tag releases.
2. **GitHub Actions (free Windows runner)** — builds the Windows installer
   every time you push a tag, publishes it to GitHub Releases.
3. **The mini PC in the gym** — runs the installed app. It polls GitHub
   Releases on launch + every 4 hours, downloads updates in the background,
   installs them on the next app quit/reboot.

Once the first install is on the mini PC, you never need to physically
touch it again for code updates. Content updates (MOTM, events, CSV imports)
happen through the Settings UI via Remote Desktop.

---

## Part 1 — First install (one-time, in person or via Remote Desktop)

### 1a. Wait for the first build to finish

After `v1.0.0` is tagged and pushed, GitHub Actions takes ~5 minutes to
produce the installer. Track it at
<https://github.com/corestarvibes/celebratedesk/actions>.

When the green check appears, the release is at
<https://github.com/corestarvibes/celebratedesk/releases> and the installer
file is named `celebratedesk-1.0.0-setup.exe`.

### 1b. Get the installer onto the mini PC

Either:
- Download `celebratedesk-1.0.0-setup.exe` directly on the mini PC via
  Chrome/Edge (easiest), **or**
- Download it on your Mac and copy via USB stick.

### 1c. Run the installer

1. Double-click the `.exe`
2. **Windows SmartScreen warning appears** — "Windows protected your PC"
   because we're not code-signing. Click **More info** → **Run anyway**.
   This only happens on the very first install. Future updates through
   electron-updater bypass SmartScreen.
3. NSIS installer runs, installs to
   `C:\Users\<user>\AppData\Local\Programs\CelebrateDesk\`
4. A desktop shortcut appears. Launch the app.

### 1d. First-run setup

Work through these in Settings (gear icon, top-right):

| Setting | What to do |
|---|---|
| **Branding** → Logo | Upload OTG logo PNG |
| **Branding** → Accent color | Confirm it's `#38bdf8` (auto) |
| **Data** → Import CSV | Drag the ChalkItPro members export (birthdays + anniversaries). Defaults to current month's rolling window |
| **Attendance** → Import | Drag the prior month's attendance CSV |
| **Members of the Month** | Add current MOTM + photo + Q&A (`.docx` drag or paste) |
| **Events** | Add any upcoming events + photos + optional QR URLs |
| **QR Codes** | Verify the 4 defaults point at the right OTG URLs |
| **Appearance** → Fullscreen | **ON** |
| **Appearance** → Always on top | **ON** |
| **Slideshow** → Duration per slide | Tune to taste (default is fine) |

### 1e. Make it boot on startup

1. `Win + R` → type `shell:startup` → Enter
2. In that folder: right-click → New → Shortcut
3. Browse to `C:\Users\<user>\AppData\Local\Programs\CelebrateDesk\CelebrateDesk.exe`
4. Name it "CelebrateDesk"
5. Right-click the shortcut → Properties → set **Run: Maximized**

### 1f. Prevent sleep / screensaver / auto-restart

Windows Settings → System → **Power & sleep**:
- Screen: **Never**
- Sleep: **Never**

Windows Settings → Personalization → **Lock screen** → Screen saver settings:
- Screen saver: **(None)**

Windows Settings → **Windows Update** → Advanced options:
- **Active hours** → set to the gym's operating hours (e.g. 5am–10pm)

### 1g. Set up Chrome Remote Desktop (for updates + troubleshooting)

1. On the mini PC: open Chrome → <https://remotedesktop.google.com/access>
2. Sign in with a Google account you control (a throwaway one is fine)
3. Install the Chrome Remote Desktop host → set a PIN
4. Now you can connect from your Mac's browser anytime the mini PC is on

**Why CRD and not Windows RDP?** CRD works through firewalls with no router
config. Home Windows doesn't include RDP server anyway. CRD is free and
takes 2 minutes.

### 1h. Second monitor — Google Photos slideshow

1. On the mini PC, open Chrome, go to photos.google.com, open the album you
   want on display
2. Fullscreen it (F11) and drag to monitor 2
3. For auto-start: make another shortcut in `shell:startup` pointing at
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --window-position=1920,0 https://photos.google.com/share/<album-link>
   ```
   Adjust `--window-position` X-coordinate to monitor 2's left edge
   (1920 if monitor 1 is 1080p, 2560 if 1440p, etc.)

---

## Part 2 — Pushing an update (day-to-day flow)

### 2a. Make the change on your Mac

```
cd ~/Desktop/celebratedesk
# ... edit files ...
npm test              # 73/73 should still pass
npm run build         # should be clean
```

### 2b. Commit + tag + push

```
git add -A
git commit -m "fix: whatever you changed"
git push

# bump version in package.json (e.g. 1.0.0 -> 1.0.1)
npm version patch     # this edits package.json AND creates a git tag
git push --tags
```

The `npm version patch` step is the key one — it:
1. Bumps `"version"` in `package.json` (e.g. 1.0.0 → 1.0.1)
2. Creates a commit with that version bump
3. Creates a git tag `v1.0.1`

**Use `patch` / `minor` / `major`** per semver:
- `patch` — bug fix, content tweak (most updates)
- `minor` — new feature (e.g. a new view)
- `major` — breaking schema change (rare)

### 2c. Watch the build

<https://github.com/corestarvibes/celebratedesk/actions>

~5 minutes later, the green check means the release is published. You can
stop there — the mini PC will pick it up automatically.

### 2d. Want to force the mini PC to update right now?

RDP into the mini PC, close the app (or `Ctrl+Q` if it's fullscreen), wait
5 seconds, re-launch. The updater checks on every launch. If there's a new
version it downloads in the background and installs on the next close.

To skip the two-step dance: close → wait for the toast "Update 1.0.1 ready
— restart to install" → close again. Second close triggers the install.

---

## Part 3 — Updating content without a code release

Most updates aren't code — they're swapping the current MOTM, importing
next month's CSV, adding upcoming events. None of these need a release.

RDP into the mini PC, open the app, open Settings, make the change, done.
The app auto-saves and re-renders live.

The only content updates that require a code release are:
- Changing the brand color (hardcoded in CSS for now — could be made
  settings-configurable later)
- Adding / removing a view
- Changing the slideshow order or timing defaults

---

## Part 4 — Emergencies

### "The wall is showing a blank screen / frozen"

1. RDP into the mini PC
2. Check Task Manager — is `CelebrateDesk.exe` running?
3. If not: relaunch from the Start menu
4. If yes but frozen: kill it, relaunch

### "The auto-update broke something — I need to roll back"

1. RDP into the mini PC
2. Download the last-known-good installer from
   <https://github.com/corestarvibes/celebratedesk/releases>
3. Run it — it installs over the current version
4. On your Mac, immediately publish a fixed release so the mini PC picks
   up the fix on its next check (otherwise it'll try to re-upgrade to the
   broken version)

### "I can't RDP into the mini PC at all"

The mini PC is offline. Someone has to physically check it — network cable,
power, monitor cables.

### "The installer won't download the update"

Check:
1. GitHub Releases page shows the new `latest.yml` + `.exe` file
2. The mini PC has internet
3. Windows Defender isn't blocking the downloaded `.exe` (check the
   Windows Security → Protection history)

---

## Part 5 — What lives where

| Item | Location on mini PC |
|---|---|
| App binary | `C:\Users\<user>\AppData\Local\Programs\CelebrateDesk\` |
| SQLite DB (all events, MOTM, attendance) | `C:\Users\<user>\AppData\Roaming\celebratedesk\events.db` |
| Settings (brand, slideshow order, accent color) | `C:\Users\<user>\AppData\Roaming\celebratedesk\config.json` |
| User-uploaded photos (logo, events, MOTM) | `C:\Users\<user>\AppData\Roaming\celebratedesk\<subfolders>` |
| Update cache (partially-downloaded updates) | `C:\Users\<user>\AppData\Local\celebratedesk-updater\` |
| App logs | `C:\Users\<user>\AppData\Roaming\celebratedesk\logs\` |

**Back up the `Roaming\celebratedesk\` folder periodically** — that's the
only thing that's irreplaceable (events, MOTM photos, attendance history).
The app binary itself is always re-downloadable from GitHub.

See Part 6 for the automated Google Drive backup script.

---

## Part 6 — Automated backups to Google Drive

A zip of the entire `Roaming\celebratedesk\` folder is pushed to Google
Drive every night at 3 AM. Keeps 14 daily + 8 weekly snapshots (~3 months
of history).

### 6a. One-time setup on the mini PC

1. **Install Google Drive for Desktop.** Download from
   <https://www.google.com/drive/download/> → install → sign in with the
   gym's Google account → pick **Stream files** during setup (this mounts
   Drive as the `G:` drive letter, which is what the backup script
   expects).
2. **Create the backup folder in Drive.** Go to drive.google.com → My
   Drive → New folder → name it `CelebrateDesk Backups`. (The script
   won't create it — Drive for Desktop only syncs folders that already
   exist in Drive.)
3. **Clone the repo somewhere on the mini PC** — a spot the gym user can
   read is fine, e.g. `C:\Users\<user>\celebratedesk-repo`:
   ```
   git clone https://github.com/corestarvibes/celebratedesk.git
   ```
   (You can also just download the two PowerShell scripts from the repo's
   `scripts/backup/` folder and drop them anywhere.)
4. **Register the scheduled task.** Open PowerShell as the gym user
   (not elevated), then:
   ```
   cd C:\Users\<user>\celebratedesk-repo\scripts\backup
   powershell -ExecutionPolicy Bypass -File install-backup-task.ps1
   ```
   You should see `✓ Task 'CelebrateDesk Daily Backup' installed`.

### 6b. Verify it works

```
Start-ScheduledTask -TaskName 'CelebrateDesk Daily Backup'
Get-ScheduledTaskInfo -TaskName 'CelebrateDesk Daily Backup'
```

Then check:
- `%APPDATA%\celebratedesk\logs\backup.log` for the run log
- `G:\My Drive\CelebrateDesk Backups\` for the new zip
- drive.google.com — the zip should appear within a minute (Drive sync
  uploads async)

### 6c. Restore from a backup

On the mini PC:
1. Close CelebrateDesk
2. Download the zip you want from drive.google.com
3. Delete `%APPDATA%\celebratedesk\` (or rename it to keep the current
   state as a safety copy)
4. Extract the zip — the inner `celebratedesk` folder is what goes in
   `%APPDATA%\`
5. Launch CelebrateDesk — it reads the restored DB + settings on startup

### 6d. What's included vs excluded

Included: `events.db`, `config.json`, all uploaded photos (logo, MOTM,
events), and any other files Electron wrote to userData.

Excluded: the `logs\` subfolder (not worth snapshotting every day) and
the update cache (regenerable).

### 6e. Storage usage

A fresh install is ~100 KB. After importing a year of events + a few MOTM
photos + a logo, expect ~5–20 MB per snapshot. With 14 dailies + 8
weeklies the total footprint is well under 500 MB — Drive's free tier
(15 GB) is plenty.

---

## Part 7 — Installing on your Mac

Same flow as the Windows install, just with the `.dmg`:

1. Go to <https://github.com/corestarvibes/celebratedesk/releases/latest>
2. Pick the right DMG for your Mac:
   - Apple Silicon (M1/M2/M3/M4/M5+): `celebratedesk-<version>-arm64.dmg`
   - Intel (anything else): `celebratedesk-<version>-x64.dmg` (or just
     `celebratedesk-<version>.dmg` for releases prior to v1.1.2 where x64
     was the un-suffixed default)

   If unsure: click the Apple menu → About This Mac. "Chip" or "Processor"
   field tells you which architecture.
3. Open the DMG, drag CelebrateDesk into Applications
4. **First launch:** macOS will block it ("can't be opened because Apple
   cannot check it for malicious software"). Right-click the app icon
   in Applications → **Open** → confirm. After that it launches normally.
5. Set up your content the same way you would on the mini PC.

**Mac auto-update note:** the app on the Mac will detect new releases
and show a "new version available" toast, but **the auto-install path
is blocked on unsigned macOS apps**. To update on your Mac, just grab
the new DMG from the Releases page when you see the toast. (Mini PCs
auto-install silently because Windows Squirrel doesn't have the same
restriction.)

If you ever want true Mac auto-update, it's a $99/year Apple Developer
cert away — not worth it for the current setup.

---

## Part 9 — Content sync (Mac → mini PCs)

The flow you actually want for content updates: open the app on your Mac,
edit MOTM/events/attendance/photos, hit save → both gym TVs reflect the
change in ~60–90 seconds. No driving, no Remote Desktop, no PowerShell.

### How it works

```
Mac edit → 5s debounce → snapshot.zip + snapshot.json
        → "CelebrateDesk Sync" folder in Google Drive
        → Drive uploads to cloud (~30s)
        → mini PCs poll every 60s
        → on new snapshot: close app, restore, relaunch (~5s)
```

Total round-trip: **typically 60–90 seconds, worst case ~2 minutes.**

### One-time setup

**On the Mac:**
1. Install CelebrateDesk (Part 7).
2. Make sure Google Drive for Desktop is running and signed into the
   same Google account as your gym TVs.
3. Open CelebrateDesk → Settings → **Sync to gym TVs** → toggle
   **Auto-sync to gym TVs on every save** to ON.
4. The app will auto-detect the Drive folder
   (`~/Library/CloudStorage/GoogleDrive-<email>/My Drive/CelebrateDesk Sync/`)
   and create it if it's missing.

**On each mini PC** (this is now bundled into the same `setup.ps1`):
1. Run the one-paste bootstrap (see Part 6 — same command, no
   change). The new version installs both the daily backup AND the
   sync watcher.
2. The watcher polls the Drive folder every 60 seconds. When a new
   snapshot from the Mac arrives, it:
   - gracefully closes CelebrateDesk
   - backs up the current state to `.previous-userData.zip` (rollback)
   - extracts the new snapshot
   - relaunches the app

### Day-to-day use

You don't think about it. Open CelebrateDesk on your Mac, change
something, click save anywhere in the app. ~90 seconds later both gym
TVs reflect the change.

The Settings → Sync section shows live status:
- **Ready. Last push: 4:32 PM** — idle, waiting for next edit
- **Edits detected — pushing in ~5 seconds…** — within the debounce window
- **Pushing to Drive now…** — actively snapshotting
- **Sync error: …** — Drive offline, folder missing, etc.

There's also a **Sync now** button if you want to skip the 5-second
debounce and force an immediate push.

### Hard rules

- **Only the Mac writes.** The toggle is hidden on Windows — followers
  can't push, by design. If two machines pushed concurrently, the
  later push would silently overwrite the earlier one.
- **Each push is a full snapshot**, not a delta. That keeps the
  follower side simple (extract + reload). Snapshots typically run
  5–20 MB.
- **Atomic writes.** The zip is written first, then the manifest
  (`snapshot.json`) is renamed into place last. Followers only see
  the new manifest after the zip is fully on disk + verified by SHA.
- **Followers verify SHA256** before extracting. If the zip is
  partially synced, the watcher backs off and retries on the next
  minute's poll.

### Restoring from rollback (mini PC blew up after a bad sync)

The watcher always keeps the previous userData as
`%APPDATA%\celebratedesk\.previous-userData.zip`. To roll back:

```
# Close the app first
taskkill /IM CelebrateDesk.exe

# Restore the rollback zip
$prev = "$env:APPDATA\celebratedesk\.previous-userData.zip"
Expand-Archive $prev -DestinationPath "$env:TEMP\celeb-rollback" -Force
robocopy "$env:TEMP\celeb-rollback\celebratedesk" "$env:APPDATA\celebratedesk" /MIR

# Stop the watcher temporarily so it doesn't re-apply the bad snapshot
Disable-ScheduledTask -TaskName 'CelebrateDesk Sync Watcher'

# Relaunch the app, then on your Mac fix the underlying issue and
# push a fresh snapshot. Re-enable the watcher when ready.
Enable-ScheduledTask -TaskName 'CelebrateDesk Sync Watcher'
```

---

## Part 10 — Known gotchas

- **First install shows SmartScreen warning.** Once only. Updates bypass.
- **Windows may reboot overnight for updates.** Set Active Hours wide.
- **If the wifi drops during an update download**, electron-updater resumes
  from the partial on the next check. No action needed.
- **The app depends on the mini PC's timezone** for "today". If the PC
  clock is wrong, the wall shows the wrong day's events. Verify timezone.
- **SQLite DB is single-writer.** Don't open the same `events.db` from
  two CelebrateDesk instances on the same machine.
