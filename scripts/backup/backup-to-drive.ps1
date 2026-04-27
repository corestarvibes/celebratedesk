# CelebrateDesk - daily backup to Google Drive.
#
# Zips the entire %APPDATA%\celebratedesk\ folder (SQLite DB, config, all
# user-uploaded photos, logs) and drops it into a folder that Google Drive
# for Desktop is syncing. Drive handles the actual upload in the background.
#
# Keeps:
#   - The 14 most recent daily snapshots (rolling)
#   - The 8 most recent weekly snapshots (one per Sunday)
# giving you roughly 3 months of history without ballooning Drive storage.
#
# See install-backup-task.ps1 to register this under Windows Task Scheduler.
# Logs go to %APPDATA%\celebratedesk\logs\backup.log so you can diagnose
# remotely via Chrome Remote Desktop.

param(
    [string]$DriveFolder = "G:\My Drive\CelebrateDesk Backups",
    [string]$SourceFolder = "$env:APPDATA\celebratedesk",
    [int]$DailyRetention = 14,
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

function Prune-Backups {
    param([string]$Folder, [string]$Pattern, [int]$KeepCount)
    $files = Get-ChildItem -Path $Folder -Filter $Pattern -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if ($files -and $files.Count -gt $KeepCount) {
        $files[$KeepCount..($files.Count - 1)] | ForEach-Object {
            Write-Log "pruning $($_.Name)"
            Remove-Item -Path $_.FullName -Force
        }
    }
}

try {
    Write-Log "backup starting"

    if (-not (Test-Path $SourceFolder)) {
        Write-Log "source folder not found: $SourceFolder (have you launched CelebrateDesk yet?)" "ERROR"
        exit 1
    }

    if (-not (Test-Path $DriveFolder)) {
        Write-Log "drive folder not found: $DriveFolder (is Google Drive for Desktop running?)" "ERROR"
        exit 1
    }

    $now = Get-Date
    $timestamp = $now.ToString("yyyy-MM-dd_HHmmss")
    $isSunday = ($now.DayOfWeek -eq [DayOfWeek]::Sunday)
    $dailyName = "celebratedesk-daily-$timestamp.zip"
    $dailyPath = Join-Path $DriveFolder $dailyName

    Write-Log "zipping $SourceFolder -> $dailyName"

    # Stage to %TEMP% via robocopy first so an open SQLite WAL file doesn't
    # fail the zip step. /XD logs excludes the logs subfolder from the copy.
    $tempStaging = Join-Path $env:TEMP "celebratedesk-backup-staging-$timestamp"
    if (Test-Path $tempStaging) { Remove-Item -Recurse -Force $tempStaging }
    New-Item -ItemType Directory -Path $tempStaging | Out-Null

    $stageDest = Join-Path $tempStaging "celebratedesk"
    & robocopy $SourceFolder $stageDest /MIR /XD logs /R:1 /W:1 /NFL /NDL /NP | Out-Null
    # robocopy exit codes 0-7 are success; 8+ is failure.
    if ($LASTEXITCODE -ge 8) {
        Write-Log "robocopy failed with exit code $LASTEXITCODE" "ERROR"
        Remove-Item -Recurse -Force $tempStaging -ErrorAction SilentlyContinue
        exit 1
    }

    Compress-Archive -Path $stageDest -DestinationPath $dailyPath -Force
    Remove-Item -Recurse -Force $tempStaging

    $zipSize = (Get-Item $dailyPath).Length / 1MB
    Write-Log ("wrote {0} ({1:N1} MB)" -f $dailyName, $zipSize)

    # Also drop a weekly copy on Sundays.
    if ($isSunday) {
        $weeklyName = "celebratedesk-weekly-$timestamp.zip"
        $weeklyPath = Join-Path $DriveFolder $weeklyName
        Copy-Item -Path $dailyPath -Destination $weeklyPath
        Write-Log "also wrote $weeklyName (Sunday -> weekly)"
    }

    Prune-Backups -Folder $DriveFolder -Pattern "celebratedesk-daily-*.zip" -KeepCount $DailyRetention
    Prune-Backups -Folder $DriveFolder -Pattern "celebratedesk-weekly-*.zip" -KeepCount $WeeklyRetention

    Write-Log "backup complete"
    exit 0
}
catch {
    Write-Log "backup failed: $_" "ERROR"
    Write-Log $_.ScriptStackTrace "ERROR"
    exit 1
}
