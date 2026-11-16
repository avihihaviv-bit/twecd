@echo off
title TWECD GAMING BOOSTER - Build Installer
cd /d "%~dp0"
echo.
echo  =============================================
echo   TWECD GAMING BOOSTER - EXTREME EDITION
echo   Building TWECD-Setup.exe
echo  =============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to build the installer ^(one time only^).
  echo Opening https://nodejs.org - install the LTS version, then run this file again.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
echo [1/2] Installing build tools...
call npm ci
if errorlevel 1 call npm install
if errorlevel 1 goto fail
echo [2/2] Building installer...
call npm run dist
if errorlevel 1 goto fail
echo.
echo  DONE: release\TWECD-Setup.exe
echo  Double-click TWECD-Setup.exe to install. A desktop shortcut is created automatically.
explorer release
pause
exit /b 0
:fail
echo.
echo  Build failed. See the messages above.
pause
exit /b 1
