@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Creando el icono de Jarvis en el Escritorio y en el menú Inicio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-acceso-directo.ps1"
if errorlevel 1 (
  echo   No pude crear el icono.
) else (
  if not exist datos mkdir datos
  echo creado> datos\acceso-directo.txt
  echo   Listo: busca el icono "Jarvis" en tu Escritorio.
)
echo.
