# Register the CelebrateDesk sync watcher under Windows Task Scheduler.
#
# Runs watch.ps1 every 60 seconds. Each run is short and exits quickly if
# nothing has changed; only does real work when a fresh snapshot from the
# Mac has actually arrived in Drive.
#
# This is normally invoked by setup.ps1 — you don't run this directly
# unless you're rebuilding the watcher manually.

param(
    [string]$TaskName = "CelebrateDesk Sync Watcher",
    [string]$ScriptPath = (Join-Path $PSScriptRoot "watch.ps1"),
    [string]$DriveFolder = "G:\My Drive\CelebrateDesk Sync"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "watcher script not found at $ScriptPath"
    exit 1
}

# Replace existing task if present (idempotent re-run)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "removing existing task '$TaskName'"
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -DriveFolder `"$DriveFolder`""

# Trigger every 60 seconds, indefinitely. We use a daily trigger that
# repeats every minute for 24 hours and `RepetitionDuration -gt 1 day`
# behaves correctly under Win10/11.
$trigger = New-ScheduledTaskTrigger -Daily -At "12:00am"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Days 1)).Repetition

# Run as the gym user (Interactive) — needs access to %APPDATA% and the
# user-mounted Google Drive. RunLevel Limited keeps it out of admin.
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Polls Drive for new CelebrateDesk content snapshots from the Mac and applies them." | Out-Null

Write-Host ""
Write-Host "[OK] Task '$TaskName' installed. Polls every minute." -ForegroundColor Green
Write-Host ""
Write-Host "Logs: $env:APPDATA\celebratedesk\logs\sync.log"
