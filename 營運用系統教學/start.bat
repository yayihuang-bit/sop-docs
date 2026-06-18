@echo off
cd /d "%~dp0"

if not exist "src\node_modules" (
    echo Installing packages, please wait...
    pushd src
    npm install
    popd
    echo Done.
    echo.
)

node src\ui-server.js
pause
