# CelebrateDesk — daily backup to Google Drive.
#
# Zips the entire %APPDATA%\celebratedesk\ folder (SQLite DB, config, all
# user-uploaded photos, logs) and drops it into a folder that Google Drive
# for Desktop is syncing. Drive handles the actual upload in the background.
#
# This script keeps:
#   - The 14 most recent daily snapshots (rolling)
#   - The 8 most recent weekly snapshots (one per Sunday)
# giving you roughly 3 months of history without ballooning Drive storage.
#
# See install-backup-task.ps1 to register this under Windows Task Scheduler.
# Logs go to %APPDATA%\celebratedesk\logs\backup.log so you can diagnose
# remotely via Chrome Remote Desktop.

param(
    # Where Drive for Desktop syncs locally. Google Drive mounts as a drive
    # letter (usually G:) when you install "Google Drive for Desktop" and
    # pick "Stream files". If you picked "Mirror files" it goes under
    # %USERPROFILE%\Google Drive\ instead — adjust accordingly.
    [string]$DriveFolder = "G:\My Drive\CelebrateDesk Backups",

    # Source data folder. This is where Electron's app.getPath('userData')
    # resolves to on Windows — don't change unless the app changes.
    [string]$SourceFolder = "$env:APPDATA\celebratedesk",

    # How many daily snapshots to keep before pruning.
    [int]$DailyRetention = 14,

    # How many weekly snapshots to keep (Sunday backups are tagged 'weekly').
    [int]$WeeklyRetention = 8
)

$ErrorActionPreference = "Stop"

$logDir = Join-Path $SourceFolder "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logPath = Join-Path $logDir "backup.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    Add-Content -Path $logPath -Value $line
    Write-Host $line
}

try {
    Write-Log "backup starting"

    if (-not (Test-Path $SourceFolder)) {
        Write-Log "source folder not found: $SourceFolder" "ERROR"
        exit 1
    }

    if (-not (Test-Path $DriveFolder)) {
        Write-Log "drive folder not found: $DriveFolder — is Google Drive for Desktop running?" "ERROR"
        exit 1
    }

    # Tag with daily/weekly so pruning can keep them separately. Sunday backups
    # graduate to the weekly bucket — the daily copy is still written first
    # and then rotated out after 14 days.
    $now = Get-Date
    $timestamp = $now.ToString("yyyy-MM-dd_HHmmss")
    $isSunday = ($now.DayOfWeek -eq [DayOfWeek]::Sunday)
    $dailyName = "celebratedesk-daily-$timestamp.zip"
    $dailyPath = Join-Path $DriveFolder $dailyName

    Write-Log "zipping $SourceFolder -> $dailyName"

    # Exclude the logs subfolder from the backup — no point snapshotting our
    # own log file every day, and logs can grow without bound.
    $tempStaging = Join-Path $env:TEMP "celebratedesk-backup-staging-$timestamp"
    if (Test-Path $tempStaging) { Remove-Item -Recurse -Force $tempStaging }
    New-Item -ItemType Directory -Path $tempStaging | Out-Null

    # robocopy is the robust way to copy open files on Windows. /MIR mirrors,
    # /XD logs excludes the logs subfolder, /R:1 /W:1 limits retries on lock.
    $robocopyArgs = @(
        $SourceFolder,
        (Join-Path $tempStaging "celebratedesk"),
        "/MIR",
        "/XD", "logs",
        "/R:1",
        "/W:1",
        "/NFL",  # no file list in output
        "/NDL",  # no directory list in output
        "/NP"    # no progress
    )
    & robocopy @robocopyArgs | Out-Null
    # robocopy exit codes 0-7 are success (8+ is failure).
    if ($LASTEXITCODE -ge 8) {
        Write-Log "robocopy failed with exit code $LASTEXITCODE" "ERROR"
        Remove-Item -Recurse -Force $tempStaging -ErrorAction SilentlyContinue
        exit 1
    }

    Compress-Archive -Path (Join-Path $tempStaging "celebratedesk") -DestinationPath $dailyPath -Force
    Remove-Item -Recurse -Force $tempStaging

    $zipSize = (Get-Item $dailyPath).Length / 1MB
    Write-Log ("wrote {0} ({1:N1} MB)" -f $dailyName, $zipSize)

    # Also drop a weekly copy on Sundays. Same zip, different filename, so
    # rotation can treat them independently.
    if ($isSunday) {
        $weeklyName = "celebratedesk-weekly-$timestamp.zip"
        $weeklyPath = Join-Path $DriveFolder $weeklyName
        Copy-Item -Path $dailyPath -Destination $weeklyPath
        Write-Log "also wrote $weeklyName (Sunday -> weekly)"
    }

    # Rotation: keep the N most recent of each tag, delete older.
    function Prune-Backups {
        param([string]$Pattern, [int]$KeepCount)
        $files = Get-ChildItem -Path $DriveFolder -Filter $Pattern |
            Sort-Object LastWriteTime -Descending
        if ($files.Count -gt $KeepCount) {
            $files[$KeepCount..($files.Count - 1)] | ForEach-Object {
                Write-Log "pruning $($_.Name)"
                Remove-Item -Path $_.FullName -Force
            }
        }
    }

    Prune-Backups "celebratedesk-daily-*.zip" $DailyRetention
    Prune-Backups "celebratedesk-weekly-*.zip" $WeeklyRetention

    Write-Log "backup complete"
    exit 0
}
catch {
    Write-Log "backup failed: $_" "ERROR"
    Write-Log $_.ScriptStackTrace "ERROR"
    exit 1
}
