# Register CelebrateDesk daily backup under Windows Task Scheduler.
#
# Run this ONCE on the mini PC, from a PowerShell window as the gym user
# (not elevated — we want the task to run under the user account so it can
# see %APPDATA% and the mapped Google Drive folder).
#
#   powershell -ExecutionPolicy Bypass -File install-backup-task.ps1
#
# Prerequisites before running:
#   1. Google Drive for Desktop is installed and signed into the gym's
#      Google account.
#   2. The folder "CelebrateDesk Backups" exists inside My Drive (create
#      it via drive.google.com once).
#   3. The DriveFolder path below resolves on this machine — default is
#      G:\My Drive\CelebrateDesk Backups\ (the default mount point for
#      "Stream files" mode). If you picked "Mirror files" mode during
#      Drive setup, change the path accordingly.
#
# The task fires at 3:00 AM local time every day. Backup script logs go to
# %APPDATA%\celebratedesk\logs\backup.log.

param(
    [string]$TaskName = "CelebrateDesk Daily Backup",
    [string]$ScriptPath = (Join-Path $PSScriptRoot "backup-to-drive.ps1"),
    [string]$DriveFolder = "G:\My Drive\CelebrateDesk Backups",
    [string]$TriggerTime = "03:00"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "backup script not found at $ScriptPath"
    exit 1
}

# If the task already exists, remove it first so re-running this script
# updates rather than duplicates.
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "removing existing task '$TaskName'"
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -DriveFolder `"$DriveFolder`""

$trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime

# Run under the current user so the task has access to %APPDATA% and the
# user-mounted Google Drive. StartWhenAvailable means if the PC was asleep
# at 3am it runs as soon as it wakes up.
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Daily zip backup of %APPDATA%\celebratedesk to Google Drive." | Out-Null

Write-Host ""
Write-Host "✓ Task '$TaskName' installed. Runs daily at $TriggerTime." -ForegroundColor Green
Write-Host ""
Write-Host "To run it right now (for testing):"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check the last run status:"
Write-Host "  Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host ""
Write-Host "Logs: $env:APPDATA\celebratedesk\logs\backup.log"
