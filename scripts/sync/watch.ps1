# CelebrateDesk - sync follower (mini PC).
#
# Polls Google Drive for a fresh content snapshot pushed by the Mac, and
# when one arrives:
#   1. gracefully closes the running app
#   2. backs up the current userData (rollback safety)
#   3. extracts the snapshot into userData
#   4. relaunches the app
#
# Lifecycle: registered as a Windows Task Scheduler entry that runs every
# minute (see install-sync-watcher.ps1). Each invocation is short — checks
# the manifest, exits if not newer, only does real work when there's an
# actual update.
#
# All paths configurable via params; defaults match the bootstrap script
# (G:\My Drive\CelebrateDesk Sync\snapshot.json).

param(
    [string]$DriveFolder = "G:\My Drive\CelebrateDesk Sync",
    [string]$AppDataFolder = "$env:APPDATA\celebratedesk",
    [string]$AppExe = "$env:LOCALAPPDATA\Programs\CelebrateDesk\CelebrateDesk.exe",
    [int]$KillTimeoutSec = 15
)

$ErrorActionPreference = "Stop"

$logDir = Join-Path $AppDataFolder "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logPath = Join-Path $logDir "sync.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    Add-Content -Path $logPath -Value $line
    Write-Host $line
}

# ---------------------------------------------------------------------------
# Step 1: is there a snapshot, and is it newer than what we last applied?

$manifestPath = Join-Path $DriveFolder "snapshot.json"
$zipPath = Join-Path $DriveFolder "snapshot.zip"
$lastAppliedPath = Join-Path $AppDataFolder ".last-applied.json"

if (-not (Test-Path $manifestPath)) {
    # No snapshot yet — first-time setup, no Mac has pushed. Quiet exit.
    exit 0
}

try {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
}
catch {
    Write-Log "manifest unreadable: $_" "WARN"
    exit 0
}

if (-not $manifest.timestamp -or -not $manifest.sha256) {
    Write-Log "manifest missing required fields" "WARN"
    exit 0
}

$lastTs = 0
if (Test-Path $lastAppliedPath) {
    try {
        $lastApplied = Get-Content $lastAppliedPath -Raw | ConvertFrom-Json
        $lastTs = [int64]$lastApplied.timestamp
    }
    catch {
        # corrupt local state — treat as "never applied"
        $lastTs = 0
    }
}

if ([int64]$manifest.timestamp -le $lastTs) {
    # Up to date, nothing to do. Don't even log — this fires every minute.
    exit 0
}

Write-Log "snapshot newer than last applied (manifest=$($manifest.timestamp), last=$lastTs)"

# ---------------------------------------------------------------------------
# Step 2: verify the zip actually exists and matches the manifest's hash
# before we touch anything. A partially-synced Drive file is a real
# failure mode — Drive may still be downloading.

if (-not (Test-Path $zipPath)) {
    Write-Log "manifest exists but zip is missing — Drive likely still syncing" "WARN"
    exit 0
}

try {
    $actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLower()
}
catch {
    Write-Log "could not hash zip: $_" "WARN"
    exit 0
}

$expectedHash = $manifest.sha256.ToLower()
if ($actualHash -ne $expectedHash) {
    Write-Log "hash mismatch (expected=$expectedHash, got=$actualHash) — Drive still syncing?" "WARN"
    exit 0
}

Write-Log "zip verified, applying snapshot"

# ---------------------------------------------------------------------------
# Step 3: gracefully close the running app. taskkill without /F sends
# WM_CLOSE which Electron treats as a normal quit. Fall back to /F only
# after the timeout — we'd rather be patient than corrupt state.

$appName = Split-Path $AppExe -Leaf
$running = Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($appName)) -ErrorAction SilentlyContinue
if ($running) {
    Write-Log "closing running app ($($running.Count) process(es))"
    & taskkill /IM $appName 2>&1 | Out-Null
    $deadline = (Get-Date).AddSeconds($KillTimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $still = Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($appName)) -ErrorAction SilentlyContinue
        if (-not $still) { break }
        Start-Sleep -Seconds 1
    }
    $still = Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($appName)) -ErrorAction SilentlyContinue
    if ($still) {
        Write-Log "graceful kill timed out, forcing" "WARN"
        & taskkill /IM $appName /F 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }
}

# ---------------------------------------------------------------------------
# Step 4: snapshot the current state for rollback, then extract.

$rollbackZip = Join-Path $AppDataFolder ".previous-userData.zip"
if (Test-Path $rollbackZip) { Remove-Item $rollbackZip -Force }

# robocopy the live userData (minus our own bookkeeping) into a temp
# folder, then zip. Same pattern as backup-to-drive.ps1.
$rollbackStaging = Join-Path $env:TEMP "celebratedesk-rollback-staging-$(Get-Date -Format yyyyMMddHHmmss)"
if (Test-Path $rollbackStaging) { Remove-Item -Recurse -Force $rollbackStaging }
New-Item -ItemType Directory -Path $rollbackStaging | Out-Null
$rollbackInner = Join-Path $rollbackStaging "celebratedesk"

& robocopy $AppDataFolder $rollbackInner /MIR /XD logs /XF .previous-userData.zip .last-applied.json /R:1 /W:1 /NFL /NDL /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Log "rollback robocopy failed (code $LASTEXITCODE) — proceeding anyway" "WARN"
}
else {
    try {
        Compress-Archive -Path $rollbackInner -DestinationPath $rollbackZip -Force
        Write-Log "rollback copy: $rollbackZip"
    }
    catch {
        Write-Log "could not write rollback zip: $_" "WARN"
    }
}
Remove-Item -Recurse -Force $rollbackStaging -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
# Step 5: extract the snapshot. The zip contains a top-level "celebratedesk"
# folder; we want its CONTENTS to land in $AppDataFolder.

$extractStaging = Join-Path $env:TEMP "celebratedesk-extract-staging-$(Get-Date -Format yyyyMMddHHmmss)"
if (Test-Path $extractStaging) { Remove-Item -Recurse -Force $extractStaging }
New-Item -ItemType Directory -Path $extractStaging | Out-Null

try {
    Expand-Archive -Path $zipPath -DestinationPath $extractStaging -Force
}
catch {
    Write-Log "extract failed: $_" "ERROR"
    Remove-Item -Recurse -Force $extractStaging -ErrorAction SilentlyContinue
    exit 1
}

$snapshotInner = Join-Path $extractStaging "celebratedesk"
if (-not (Test-Path $snapshotInner)) {
    Write-Log "extracted zip does not contain the expected 'celebratedesk' folder" "ERROR"
    Remove-Item -Recurse -Force $extractStaging -ErrorAction SilentlyContinue
    exit 1
}

# Mirror snapshot into AppDataFolder. /MIR will delete files in the
# destination that aren't in the source — that's exactly what we want
# (a Mac delete should propagate to the gym TV). But we preserve a few
# follower-only files so /XF skips them.
& robocopy $snapshotInner $AppDataFolder /MIR /XF .previous-userData.zip .last-applied.json /XD logs /R:1 /W:1 /NFL /NDL /NP | Out-Null
$rcRestore = $LASTEXITCODE
Remove-Item -Recurse -Force $extractStaging -ErrorAction SilentlyContinue

if ($rcRestore -ge 8) {
    Write-Log "restore robocopy failed (code $rcRestore)" "ERROR"
    exit 1
}

# ---------------------------------------------------------------------------
# Step 6: record the applied timestamp so we don't reapply.

$lastAppliedJson = @{
    timestamp = $manifest.timestamp
    sha256    = $manifest.sha256
    appliedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json
Set-Content -Path $lastAppliedPath -Value $lastAppliedJson -Encoding UTF8

# ---------------------------------------------------------------------------
# Step 7: relaunch the app.

if (Test-Path $AppExe) {
    Write-Log "relaunching app: $AppExe"
    Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path $AppExe)
}
else {
    Write-Log "app exe not found at $AppExe — skipping relaunch (was the app uninstalled?)" "WARN"
}

Write-Log "snapshot applied successfully"
exit 0
