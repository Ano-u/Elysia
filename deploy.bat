@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [Elysia] Starting one-click deployment...

set "PM_MODE="
where pnpm.cmd >nul 2>nul
if not errorlevel 1 (
  set "PM_MODE=cmd"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Command pnpm -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "PM_MODE=powershell"
  ) else (
    where corepack.cmd >nul 2>nul
    if not errorlevel 1 (
      set "PM_MODE=corepack"
    )
  )
)

if not defined PM_MODE (
  echo [Elysia] ERROR: Neither pnpm nor corepack is available in PATH.
  exit /b 1
)

if /I "!PM_MODE!"=="cmd" (
  echo [Elysia] Package runner: pnpm.cmd
) else if /I "!PM_MODE!"=="powershell" (
  echo [Elysia] Package runner: PowerShell pnpm
) else (
  echo [Elysia] Package runner: corepack pnpm
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [Elysia] ERROR: docker is not installed or not in PATH.
  exit /b 1
)

echo [Elysia] Booting PostgreSQL and Redis via docker compose...
docker compose up -d postgres redis
if errorlevel 1 (
  echo [Elysia] ERROR: failed to start docker services.
  exit /b 1
)

if not exist "node_modules" (
  echo [Elysia] Installing dependencies...
  call :run_pnpm install
  if errorlevel 1 (
    echo [Elysia] ERROR: dependency installation failed.
    exit /b 1
  )
) else if not exist "apps\frontend\node_modules" (
  echo [Elysia] Frontend dependencies missing, installing...
  call :run_pnpm install
  if errorlevel 1 (
    echo [Elysia] ERROR: dependency installation failed.
    exit /b 1
  )
) else (
  echo [Elysia] Dependencies already present, skip install.
)

echo [Elysia] Running database migration...
call :run_pnpm migrate
if errorlevel 1 (
  echo [Elysia] ERROR: migration failed.
  exit /b 1
)

set "FRONTEND_PORT=5173"
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo [Elysia] WARNING: Port 5173 is already in use. Frontend will use 5174.
  set "FRONTEND_PORT=5174"
)
set "FRONTEND_URL=http://127.0.0.1:!FRONTEND_PORT!"

echo [Elysia] Launching backend, frontend, and worker...
if /I "!PM_MODE!"=="powershell" (
  start "Elysia Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; pnpm dev"
  start "Elysia Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; pnpm --filter frontend dev -- --host 127.0.0.1 --port !FRONTEND_PORT! --strictPort"
  start "Elysia Worker" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; pnpm worker"
) else if /I "!PM_MODE!"=="corepack" (
  start "Elysia Backend" cmd /k "cd /d \"%ROOT%\" && corepack.cmd pnpm dev"
  start "Elysia Frontend" cmd /k "cd /d \"%ROOT%\" && corepack.cmd pnpm --filter frontend dev -- --host 127.0.0.1 --port !FRONTEND_PORT! --strictPort"
  start "Elysia Worker" cmd /k "cd /d \"%ROOT%\" && corepack.cmd pnpm worker"
) else (
  start "Elysia Backend" cmd /k "cd /d \"%ROOT%\" && pnpm.cmd dev"
  start "Elysia Frontend" cmd /k "cd /d \"%ROOT%\" && pnpm.cmd --filter frontend dev -- --host 127.0.0.1 --port !FRONTEND_PORT! --strictPort"
  start "Elysia Worker" cmd /k "cd /d \"%ROOT%\" && pnpm.cmd worker"
)

echo [Elysia] Done.
echo [Elysia] Backend : http://localhost:3000
echo [Elysia] Frontend: !FRONTEND_URL!
echo [Elysia] Use stop.bat to close all local services.

echo [Elysia] Waiting for frontend readiness and opening browser...
powershell -NoProfile -Command "$url='!FRONTEND_URL!'; $ok=$false; for($i=0;$i -lt 60;$i++){ try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ $ok=$true; break } } catch {}; Start-Sleep -Milliseconds 800 }; if($ok){ Start-Process $url; exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [Elysia] WARNING: Frontend is not ready yet. Open !FRONTEND_URL! manually.
)

exit /b 0

:run_pnpm
if /I "!PM_MODE!"=="cmd" (
  call pnpm.cmd %*
  exit /b !errorlevel!
)
if /I "!PM_MODE!"=="powershell" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "pnpm %*"
  exit /b !errorlevel!
)
if /I "!PM_MODE!"=="corepack" (
  corepack.cmd pnpm %*
  exit /b !errorlevel!
)
exit /b 1
