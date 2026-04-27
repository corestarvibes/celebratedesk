# CelebrateDesk - one-shot mini PC setup.
#
# Installs both pipelines on a fresh gym TV in one paste:
#   - daily backup -> "CelebrateDesk Backups" folder in Drive (3 AM)
#   - sync watcher -> polls "CelebrateDesk Sync" folder every minute,
#     auto-restores when the Mac pushes a new content snapshot
#
# Paste this whole thing into PowerShell (regular, not admin):
#
#   irm https://raw.githubusercontent.com/corestarvibes/celebratedesk/main/scripts/backup/setup.ps1 | iex
#
# That's it. No decisions, no other steps.

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host ""; Write-Host ">>> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "    [X]  $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
Step "1/8  Checking CelebrateDesk is installed and has been launched"
$appData = Join-Path $env:APPDATA "celebratedesk"
if (-not (Test-Path $appData)) {
    Err "Cannot find $appData"
    Err "Install CelebrateDesk and launch it once before running this script."
    Err "Download: https://github.com/corestarvibes/celebratedesk/releases/latest"
    exit 1
}
Ok "Found $appData"

# ---------------------------------------------------------------------------
Step "2/8  Detecting Google Drive for Desktop mount point"
$driveLetter = $null
Get-PSDrive -PSProvider FileSystem | ForEach-Object {
    $myDrive = Join-Path $_.Root "My Drive"
    if (Test-Path $myDrive) {
        $driveLetter = $_.Root.TrimEnd('\')
        return
    }
}
if (-not $driveLetter) {
    Err "Could not find a 'My Drive' folder on any drive letter."
    Err "Make sure Google Drive for Desktop is installed, signed in, and"
    Err "running ('Stream files' mode). Check the system tray for the Drive icon."
    exit 1
}
Ok "Drive mounted at $driveLetter"

$backupFolder = Join-Path $driveLetter "My Drive\CelebrateDesk Backups"
$syncFolder   = Join-Path $driveLetter "My Drive\CelebrateDesk Sync"

# ---------------------------------------------------------------------------
Step "3/8  Ensuring Drive folders exist"
foreach ($f in @($backupFolder, $syncFolder)) {
    if (-not (Test-Path $f)) {
        Warn "Creating: $f"
        try {
            New-Item -ItemType Directory -Path $f -Force | Out-Null
            Ok "Created. Drive will sync it within ~30 seconds."
        }
        catch {
            Err "Could not create the folder: $_"
            Err "Create it manually at drive.google.com under My Drive,"
            Err "wait for it to appear locally, then re-run this script."
            exit 1
        }
    }
    else {
        Ok "Exists: $f"
    }
}

# ---------------------------------------------------------------------------
Step "4/8  Downloading backup scripts"
$backupDir = Join-Path $env:USERPROFILE "Desktop\celebratedesk-backup"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}
$backupBase = "https://raw.githubusercontent.com/corestarvibes/celebratedesk/main/scripts/backup"
foreach ($name in @("backup-to-drive.ps1", "install-backup-task.ps1")) {
    $dest = Join-Path $backupDir $name
    Invoke-WebRequest "$backupBase/$name" -OutFile $dest -UseBasicParsing
    Ok "$name -> $backupDir"
}

# ---------------------------------------------------------------------------
Step "5/8  Downloading sync scripts"
$syncDir = Join-Path $env:USERPROFILE "Desktop\celebratedesk-sync"
if (-not (Test-Path $syncDir)) {
    New-Item -ItemType Directory -Path $syncDir -Force | Out-Null
}
$syncBase = "https://raw.githubusercontent.com/corestarvibes/celebratedesk/main/scripts/sync"
foreach ($name in @("watch.ps1", "install-sync-watcher.ps1")) {
    $dest = Join-Path $syncDir $name
    Invoke-WebRequest "$syncBase/$name" -OutFile $dest -UseBasicParsing
    Ok "$name -> $syncDir"
}

# ---------------------------------------------------------------------------
Step "6/8  Registering daily backup task (3 AM)"
$installBackup = Join-Path $backupDir "install-backup-task.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $installBackup -DriveFolder $backupFolder
if ($LASTEXITCODE -ne 0) {
    Err "Backup task installation failed (exit $LASTEXITCODE)"
    exit 1
}
Ok "Backup task installed."

# ---------------------------------------------------------------------------
Step "7/8  Registering sync watcher task (every minute)"
$installWatcher = Join-Path $syncDir "install-sync-watcher.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $installWatcher -DriveFolder $syncFolder
if ($LASTEXITCODE -ne 0) {
    Err "Sync watcher installation failed (exit $LASTEXITCODE)"
    exit 1
}
Ok "Sync watcher installed."

# ---------------------------------------------------------------------------
Step "8/8  Running a smoke-test backup right now"
$backupScript = Join-Path $backupDir "backup-to-drive.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $backupScript -DriveFolder $backupFolder
if ($LASTEXITCODE -ne 0) {
    Err "Smoke-test backup failed (exit $LASTEXITCODE)"
    Err "Log: $env:APPDATA\celebratedesk\logs\backup.log"
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  All set." -ForegroundColor Green
Write-Host "  Backups: daily at 3 AM" -ForegroundColor Green
Write-Host "  Sync watcher: every 60 seconds" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backups land in: $backupFolder"
Write-Host "Sync folder:     $syncFolder"
Write-Host "Logs:            $env:APPDATA\celebratedesk\logs\"
Write-Host ""
Write-Host "Now go to your Mac:"
Write-Host "  1. Install CelebrateDesk on the Mac (download .dmg from the Releases page)"
Write-Host "  2. Open it, go to Settings -> Sync to gym TVs -> turn on 'Auto-sync'"
Write-Host "  3. Make a content edit -> ~60-90 seconds later this gym TV updates"
Write-Host ""
