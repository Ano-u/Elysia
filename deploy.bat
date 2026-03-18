@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [Elysia] Starting one-click deployment...

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [Elysia] ERROR: pnpm is not installed or not in PATH.
  exit /b 1
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
  pnpm install
  if errorlevel 1 (
    echo [Elysia] ERROR: dependency installation failed.
    exit /b 1
  )
) else if not exist "apps\frontend\node_modules" (
  echo [Elysia] Frontend dependencies missing, installing...
  pnpm install
  if errorlevel 1 (
    echo [Elysia] ERROR: dependency installation failed.
    exit /b 1
  )
) else (
  echo [Elysia] Dependencies already present, skip install.
)

echo [Elysia] Running database migration...
pnpm migrate
if errorlevel 1 (
  echo [Elysia] ERROR: migration failed.
  exit /b 1
)

echo [Elysia] Launching backend, frontend, and worker...
start "Elysia Backend" cmd /k "cd /d \"%ROOT%\" && pnpm dev"
start "Elysia Frontend" cmd /k "cd /d \"%ROOT%\" && pnpm --filter frontend dev -- --host 0.0.0.0 --port 5173 --strictPort"
start "Elysia Worker" cmd /k "cd /d \"%ROOT%\" && pnpm worker"

echo [Elysia] Done.
echo [Elysia] Backend : http://localhost:3000
echo [Elysia] Frontend: http://localhost:5173
echo [Elysia] Use stop.bat to close all local services.
start "" "http://localhost:5173"
exit /b 0
