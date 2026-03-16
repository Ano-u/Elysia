param(
  [string]$OutDir = ".\backups\inc",
  [string]$PgHost = "localhost",
  [string]$PgPort = "5432",
  [string]$PgUser = "postgres",
  [string]$PgDb = "elysia"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $OutDir "elysia_inc_$timestamp.dump"

$env:PGPASSWORD = $env:POSTGRES_PASSWORD
pg_dump -h $PgHost -p $PgPort -U $PgUser -d $PgDb -F c -f $file

Write-Host "清理3天前增量快照..."
Get-ChildItem -Path $OutDir -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-3) } |
  Remove-Item -Force

Write-Host "增量快照已写入: $file"
