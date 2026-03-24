@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [Elysia] Stopping local dev windows...
taskkill /FI "WINDOWTITLE eq Elysia Backend*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Elysia Frontend*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Elysia Worker*" /T /F >nul 2>nul

echo [Elysia] Releasing common dev ports if still occupied...
call :kill_port 3000 backend
call :kill_port 5173 frontend
call :kill_port 5174 frontend-fallback
call :kill_port 5175 frontend-fallback-2
call :kill_port 24678 vite-hmr
call :kill_port 24679 vite-hmr-alt

echo [Elysia] Stopping Docker services...
where docker >nul 2>nul
if errorlevel 1 (
  echo [Elysia] WARNING: docker is not in PATH, skip container stop.
) else (
  docker compose stop api worker caddy cloudflared postgres redis >nul 2>nul
  if errorlevel 1 (
    echo [Elysia] WARNING: unable to stop docker services. Try running stop.bat as Administrator.
  ) else (
    echo [Elysia] Docker services stopped.
  )
)

echo [Elysia] Done.
exit /b 0

:kill_port
set "PORT=%~1"
set "LABEL=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ids = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique; if ($ids) { foreach($id in $ids){ try { Stop-Process -Id $id -Force -ErrorAction Stop } catch {} }; exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo [Elysia] Port %PORT% released [%LABEL%].
  exit /b 0
)
set "PORT_RELEASED="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>nul
  if not errorlevel 1 (
    set "PORT_RELEASED=1"
  )
)
if defined PORT_RELEASED (
  echo [Elysia] Port %PORT% released [%LABEL%].
)
exit /b 0
