@echo off
chcp 65001 >nul
title Conectar Ares con Claude
cd /d "%~dp0"
node configurar-claude.mjs
rem Apagar Ares para que al abrirlo de nuevo use la clave nueva
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/apagar -TimeoutSec 2 | Out-Null } catch {}" >nul 2>nul
echo   Listo. Abre Ares otra vez con su icono.
echo.
pause
