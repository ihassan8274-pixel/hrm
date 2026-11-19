@echo off
title Salary Management System
echo ==================================================
echo Starting Salary Management System...
echo ==================================================

:: 1. Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Node.js is not installed on this PC!
    echo Please download and install the LTS version from: https://nodejs.org/
    echo Once installed, restart your computer and run this file again.
    pause
    exit /b
)

:: 2. If node_modules doesn't exist, run npm install
if not exist "node_modules\" (
    echo [!] node_modules folder is missing. Installing dependencies...
    echo (This may take a minute. Please keep this window open...)
    call npm install
    if %errorlevel% neq 0 (
        echo [!] ERROR: npm install failed. Please check your internet connection.
        pause
        exit /b
    )
)

:: 3. Checks if build exists (dist folder)
if not exist "dist\" (
    echo [!] dist folder not found. Building the application...
    call npm run build
    if %errorlevel% neq 0 (
        echo [!] ERROR: Build failed.
        pause
        exit /b
    )
)

echo [+] Opening system in browser...
set PORT=8090
set NODE_ENV=production
start "" http://localhost:8090

echo [+] Starting server...
npm start

pause
