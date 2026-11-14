@echo off
setlocal
cd /d "%~dp0"
echo ==============================================================================
echo [VitalGrid] Iniciando Demonio Aeroespacial VitalGrid (Modo Offline HTTP)
echo ==============================================================================

echo Limpiando procesos previos de vitalgrid_daemon.exe...
taskkill /F /IM vitalgrid_daemon.exe >nul 2>&1

if not exist vitalgrid_daemon.exe (
    echo vitalgrid_daemon.exe no encontrado. Ejecutando build.bat primero...
    call build.bat
    if %ERRORLEVEL% NEQ 0 exit /b 1
)

echo Iniciando servidor HTTP local en http://localhost:8080 ...
start "VitalGrid HTTP Server" /B python -m http.server 8080 >nul 2>&1
timeout /t 1 /nobreak >nul

echo Abriendo Dashboard en http://localhost:8080/web/index.html ...
start "" "http://localhost:8080/web/index.html"

echo Iniciando backend en ws://127.0.0.1:9002...
echo (Presiona Ctrl+C para detener el demonio)
vitalgrid_daemon.exe 9002
