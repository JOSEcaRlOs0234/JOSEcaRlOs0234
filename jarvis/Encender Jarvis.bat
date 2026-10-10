@echo off
chcp 65001 >nul
title J.A.R.V.I.S.
cd /d "%~dp0"

echo.
echo   Encendiendo J.A.R.V.I.S. ...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   No encuentro Node.js en esta computadora.
  echo   Instálalo desde https://nodejs.org ^(botón "LTS"^) y vuelve a intentarlo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\tsx.cmd" (
  echo   Primera vez: instalando las piezas de Jarvis. Puede tardar unos minutos...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   La instalación falló. Revisa tu internet y vuelve a abrir este archivo.
    pause
    exit /b 1
  )
)

findstr /b "GEMINI_API_KEY=" ".env" >nul 2>nul
if errorlevel 1 (
  node configurar.mjs
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist "datos\acceso-directo.txt" call "Crear acceso directo.bat"

rem Si quedó encendido otro Jarvis (por ejemplo una versión vieja), se apaga para usar este
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/apagar -TimeoutSec 2 | Out-Null; Start-Sleep -Seconds 2 } catch {}" >nul 2>nul

set ABRIR_NAVEGADOR=1
call node_modules\.bin\tsx.cmd server.ts

echo.
echo   Jarvis se apagó.
pause
