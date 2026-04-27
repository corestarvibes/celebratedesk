# CelebrateDesk - one-shot backup setup.
#
# This is the ONLY script you need to run. It:
#   1. Verifies CelebrateDesk has been installed and launched at least once
#   2. Verifies Google Drive for Desktop is running and finds the drive letter
#   3. Verifies (or creates) the "CelebrateDesk Backups" folder in Drive
#   4. Downloads the latest backup-to-drive.ps1 + install-backup-task.ps1
#   5. Registers the daily 3 AM scheduled task
#   6. Runs the backup once as a smoke test
#   7. Reports the result
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
Step "1/6  Checking CelebrateDesk is installed and has been launched"
$appData = Join-Path $env:APPDATA "celebratedesk"
if (-not (Test-Path $appData)) {
    Err "Cannot find $appData"
    Err "Install CelebrateDesk and launch it once before running this script."
    Err "Download: https://github.com/corestarvibes/celebratedesk/releases/latest"
    exit 1
}
Ok "Found $appData"

# ---------------------------------------------------------------------------
Step "2/6  Detecting Google Drive for Desktop mount point"
# Drive for Desktop usually mounts as G:, but can be any letter. Find it by
# scanning fixed drives for a "My Drive" subfolder.
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

# ---------------------------------------------------------------------------
Step "3/6  Ensuring 'CelebrateDesk Backups' folder exists in Drive"
if (-not (Test-Path $backupFolder)) {
    Warn "Folder not found, creating: $backupFolder"
    try {
        New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null
        Ok "Created. Drive will sync it within ~30 seconds."
    }
    catch {
        Err "Could not create the folder: $_"
        Err "Create it manually at drive.google.com (My Drive -> New folder ->"
        Err "'CelebrateDesk Backups'), wait for it to appear in $backupFolder,"
        Err "then re-run this script."
        exit 1
    }
}
else {
    Ok "Folder exists: $backupFolder"
}

# ---------------------------------------------------------------------------
Step "4/6  Downloading backup scripts"
$scriptDir = Join-Path $env:USERPROFILE "Desktop\celebratedesk-backup"
if (-not (Test-Path $scriptDir)) {
    New-Item -ItemType Directory -Path $scriptDir -Force | Out-Null
}
$base = "https://raw.githubusercontent.com/corestarvibes/celebratedesk/main/scripts/backup"
foreach ($name in @("backup-to-drive.ps1", "install-backup-task.ps1")) {
    $dest = Join-Path $scriptDir $name
    Invoke-WebRequest "$base/$name" -OutFile $dest -UseBasicParsing
    Ok "$name -> $scriptDir"
}

# ---------------------------------------------------------------------------
Step "5/6  Registering the daily 3 AM scheduled task"
$installScript = Join-Path $scriptDir "install-backup-task.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $installScript -DriveFolder $backupFolder
if ($LASTEXITCODE -ne 0) {
    Err "Task installation failed (exit $LASTEXITCODE)"
    exit 1
}
Ok "Task installed."

# ---------------------------------------------------------------------------
Step "6/6  Running a smoke-test backup right now"
$backupScript = Join-Path $scriptDir "backup-to-drive.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $backupScript -DriveFolder $backupFolder
if ($LASTEXITCODE -ne 0) {
    Err "Smoke-test backup failed (exit $LASTEXITCODE)"
    Err "Log: $env:APPDATA\celebratedesk\logs\backup.log"
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  All set. Backups will run daily at 3 AM." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backups land in: $backupFolder"
Write-Host "Logs:            $env:APPDATA\celebratedesk\logs\backup.log"
Write-Host ""
Write-Host "Open the Drive folder now to see the smoke-test backup:"
Write-Host "  explorer `"$backupFolder`""
Write-Host ""
