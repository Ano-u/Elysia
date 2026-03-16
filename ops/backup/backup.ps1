param(
  [string]$OutDir = ".\backups",
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
$baseFile = Join-Path $OutDir "elysia_full_$timestamp.sql.gz"

Write-Host "开始全量备份: $baseFile"
$env:PGPASSWORD = $env:POSTGRES_PASSWORD
pg_dump -h $PgHost -p $PgPort -U $PgUser -d $PgDb | gzip > $baseFile

Write-Host "写入备份元信息..."
$meta = @{
  type = "full"
  created_at = (Get-Date).ToString("o")
  file = $baseFile
}
$meta | ConvertTo-Json | Set-Content -Path (Join-Path $OutDir "latest_full.json")

Write-Host "清理旧全量备份（仅保留最新3份）..."
$files = Get-ChildItem -Path $OutDir -Filter "elysia_full_*.sql.gz" | Sort-Object LastWriteTime -Descending
if ($files.Count -gt 3) {
  $files | Select-Object -Skip 3 | Remove-Item -Force
}

Write-Host "全量备份完成"
