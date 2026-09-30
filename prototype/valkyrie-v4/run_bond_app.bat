@echo off
rem Double-click to launch the bond risk app
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_bond_app.ps1" %*
pause
