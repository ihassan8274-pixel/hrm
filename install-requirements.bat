@echo off
title Setup - Salary Management System
echo ==================================================
echo Installing System Requirements...
echo ==================================================

:: Check for Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Node.js is not installed!
    echo Please download and install it from: https://nodejs.org/
    pause
    exit /b
)

echo [+] Node.js found. Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo [!] Error during npm install. Check your internet connection.
    pause
    exit /b
)

echo [+] Building the frontend...
call npm run build

if %errorlevel% neq 0 (
    echo [!] Error during npm run build.
    pause
    exit /b
)

echo ==================================================
echo SETUP COMPLETE!
echo You can now use start-app.bat to run the system.
echo ==================================================
pause
