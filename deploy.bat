@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
cd /d "%ROOT%"

echo [Elysia] Starting one-click deployment...

set "CAN_START_BACKEND=1"
set "CAN_START_WORKER=1"

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

set "DOCKER_READY=0"
where docker >nul 2>nul
if errorlevel 1 (
  echo [Elysia] WARNING: docker is not installed or not in PATH.
  echo [Elysia] WARNING: will continue startup, but backend may fail without DB/Redis.
) else (
  echo [Elysia] Booting PostgreSQL and Redis via docker compose...
  docker compose up -d postgres redis
  if errorlevel 1 (
    echo [Elysia] WARNING: failed to start docker services.
    echo [Elysia] WARNING: will continue startup, but backend may fail without DB/Redis.
  ) else (
    set "DOCKER_READY=1"
  )
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
  echo [Elysia] WARNING: migration failed. Backend and worker will be skipped.
  set "CAN_START_BACKEND=0"
  set "CAN_START_WORKER=0"
)

set "FRONTEND_PORT=5173"
call :port_in_use 5173
if not errorlevel 1 (
  echo [Elysia] WARNING: Port 5173 is already in use. Frontend will use 5174.
  set "FRONTEND_PORT=5174"
  call :port_in_use 5174
  if not errorlevel 1 (
    echo [Elysia] WARNING: Port 5174 is already in use. Frontend will use 5175.
    set "FRONTEND_PORT=5175"
  )
)
set "FRONTEND_URL=http://127.0.0.1:!FRONTEND_PORT!"

echo [Elysia] Launching backend, frontend, and worker...
if /I "!PM_MODE!"=="powershell" (
  if "!CAN_START_BACKEND!"=="1" start "Elysia Backend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; pnpm dev"
  start "Elysia Frontend" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; pnpm --filter frontend dev --host 127.0.0.1 --port !FRONTEND_PORT! --strictPort"
  if "!CAN_START_WORKER!"=="1" start "Elysia Worker" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT%'; pnpm worker"
) else if /I "!PM_MODE!"=="corepack" (
  if "!CAN_START_BACKEND!"=="1" start "Elysia Backend" cmd /k "cd /d ""%ROOT%"" && corepack.cmd pnpm dev"
  start "Elysia Frontend" cmd /k "cd /d ""%ROOT%"" && corepack.cmd pnpm --filter frontend dev --host 127.0.0.1 --port !FRONTEND_PORT! --strictPort"
  if "!CAN_START_WORKER!"=="1" start "Elysia Worker" cmd /k "cd /d ""%ROOT%"" && corepack.cmd pnpm worker"
) else (
  if "!CAN_START_BACKEND!"=="1" start "Elysia Backend" cmd /k "cd /d ""%ROOT%"" && pnpm.cmd dev"
  start "Elysia Frontend" cmd /k "cd /d ""%ROOT%"" && pnpm.cmd --filter frontend dev --host 127.0.0.1 --port !FRONTEND_PORT! --strictPort"
  if "!CAN_START_WORKER!"=="1" start "Elysia Worker" cmd /k "cd /d ""%ROOT%"" && pnpm.cmd worker"
)

echo [Elysia] Done.
if "!CAN_START_BACKEND!"=="1" (
  echo [Elysia] Backend : http://localhost:3000
) else (
  echo [Elysia] Backend : skipped [DB/Redis or migration issue]
)
echo [Elysia] Frontend: !FRONTEND_URL!
echo [Elysia] Use stop.bat to close all local services.

echo [Elysia] Waiting for frontend readiness and opening browser...
powershell -NoProfile -Command "$url='!FRONTEND_URL!'; $ok=$false; for($i=0;$i -lt 60;$i++){ try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ $ok=$true; break } } catch {}; Start-Sleep -Milliseconds 800 }; if($ok){ try { Start-Process $url -ErrorAction Stop; exit 0 } catch { exit 2 } } else { exit 1 }"
if errorlevel 2 (
  echo [Elysia] WARNING: Frontend is ready but browser auto-open failed. Open !FRONTEND_URL! manually.
  exit /b 0
)
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

:port_in_use
set "CHECK_PORT=%~1"
set "PORT_FOUND="
for /f "delims=" %%L in ('netstat -ano ^| findstr /R /C:":%CHECK_PORT% .*LISTENING"') do (
  set "PORT_FOUND=1"
)
if defined PORT_FOUND (
  exit /b 0
)
exit /b 1
