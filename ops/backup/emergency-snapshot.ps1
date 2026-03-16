param(
  [string]$OutDir = ".\backups\emergency"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$snapshot = Join-Path $OutDir "emergency_snapshot_$timestamp.flag"
"emergency snapshot requested at $(Get-Date -Format o)" | Set-Content -Path $snapshot

Write-Host "异常快照标记已创建: $snapshot"
