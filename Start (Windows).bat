@echo off
rem Double-click to start the VRT Starter Kit on Windows.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet.
  echo   Download the LTS version from https://nodejs.org, install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
call npm start
pause
