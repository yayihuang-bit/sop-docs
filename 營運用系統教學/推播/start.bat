@echo off
cd /d "%~dp0"

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Please install Node.js from https://nodejs.org then run again.
    pause
    exit /b 1
)

if not exist "src\node_modules" (
    echo Installing packages, please wait...
    pushd src
    npm.cmd install
    popd
    echo.
)

node src\ui-server.js
pause
