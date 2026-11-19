@echo off
chcp 65001 >nul
title Nuko Desk - Iniciando...
cd /d "%~dp0"

echo ===================================================
echo   Nuko Desk (Nuko ^& Luma) - Iniciando...
echo ===================================================

where git >nul 2>nul && git pull origin main
call npm.cmd install
call npm.cmd run electron:build
call npm.cmd run electron:start

pause
