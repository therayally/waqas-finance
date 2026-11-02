# Waqas' Personal Finance — connect the Claude Code on this Windows computer to the dashboard's Assistant chat.
#
#   & ([scriptblock]::Create((irm "<dashboard address>/install-relay.ps1"))) -Code setup_YOUR_CODE
#
# Get the command (with a 10-minute setup code) from the dashboard: chat bubble -> Setup -> Get my setup command.
# Installs the relay as a scheduled task that starts at logon and restarts if it stops. Uninstall: add -Uninstall.
# NOTE: written to mirror the Mac installer but NOT yet tested on Windows.
param([string]$Code = '', [switch]$Uninstall, [string]$Url = '')
$ErrorActionPreference = 'Stop'
if (-not $Url) { $Url = 'https://waqas-finance.vercel.app' }
$Dir = Join-Path $env:USERPROFILE '.pf-relay'; $Task = 'PersonalFinanceRelay'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*pf-relay.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Remove-Item -Recurse -Force $Dir -ErrorAction SilentlyContinue
  Write-Host 'Removed.'; return
}
if (-not $Code) { throw 'Missing the setup code. Get the command from the dashboard: chat bubble -> Setup -> Get my setup command.' }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 18+ is required. Install it from nodejs.org, then run this again.' }
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { $p = Join-Path $env:USERPROFILE '.local\bin\claude.exe'; if (Test-Path $p) { $claude = $p } }
if (-not $claude) { throw "Claude Code wasn't found on this computer. Install it and sign in, then run this again." }

try { $key = (Invoke-RestMethod -Method Post -Uri "$Url/api/agent/setup" -ContentType 'application/json' -Body (@{ code = $Code } | ConvertTo-Json)).key }
catch { throw "That setup code didn't work (they last 10 minutes). Get a fresh command from the dashboard." }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Content -Path (Join-Path $Dir 'env') -Value "PF_API_KEY=$key`nPF_URL=$Url`nCLAUDE_BIN=$claude" -Encoding ascii
icacls (Join-Path $Dir 'env') /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Invoke-WebRequest -Uri "$Url/pf-relay.mjs" -OutFile (Join-Path $Dir 'pf-relay.mjs')

Unregister-ScheduledTask -TaskName $Task -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $node.Source -Argument "`"$(Join-Path $Dir 'pf-relay.mjs')`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $Task
Start-Sleep -Seconds 3
try { Invoke-RestMethod -Uri "$Url/api/agent/inbox" -Headers @{ Authorization = "Bearer $key" } | Out-Null; Write-Host 'Connected. The Assistant chat will now answer using Claude Code on this computer.' }
catch { throw "Installed, but the dashboard didn't accept the key. Get a fresh setup command and run this again." }
