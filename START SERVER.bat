@echo off
title DFW Flat-Fee Facelift Tool - Local Server
cd /d "%~dp0"
echo.
echo   Starting the DFW Flat-Fee Facelift Tool...
echo   Opening http://localhost:3170 in your browser.
echo.
echo   Leave this window open while you view the site.
echo   Close it (or press Ctrl+C) to stop the server.
echo.
start "" http://localhost:3170
node serve.mjs
pause
