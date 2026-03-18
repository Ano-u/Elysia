@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [Elysia] Stopping local dev windows...
taskkill /FI "WINDOWTITLE eq Elysia Backend*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Elysia Frontend*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Elysia Worker*" /T /F >nul 2>nul

echo [Elysia] Stopping PostgreSQL and Redis containers...
docker compose stop postgres redis >nul 2>nul

echo [Elysia] Done.
exit /b 0
