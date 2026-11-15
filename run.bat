@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VitalGrid Z.E.U.S

REM Arranque de Windows: compila si falta el binario, prende el demonio en
REM 9002 y sirve la carpeta web/ por HTTP. Los dos procesos quedan vivos
REM hasta que se presiona una tecla en esta ventana.

where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py"
if not defined PY (
  echo.
  echo   No encontre Python. Instalalo desde python.org y volve a correr run.bat.
  echo.
  exit /b 1
)

if not exist vitalgrid_daemon.exe (
  echo [VitalGrid] vitalgrid_daemon.exe no esta. Compilando...
  call build.bat
  if errorlevel 1 exit /b 1
)

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo [VitalGrid] Cerrando un demonio anterior, si quedo corriendo.
taskkill /F /IM vitalgrid_daemon.exe >nul 2>&1

echo [VitalGrid] Demonio  ws://127.0.0.1:9002
start "VitalGrid Daemon" /D "%ROOT%" cmd /k "title VitalGrid Daemon & vitalgrid_daemon.exe 9002"

echo [VitalGrid] Cockpit  http://127.0.0.1:8080/
start "VitalGrid HTTP" /D "%ROOT%\web" cmd /k "title VitalGrid HTTP & %PY% -m http.server 8080"

ping -n 2 127.0.0.1 >nul

set "URL=http://127.0.0.1:8080/"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if defined CHROME (
  start "" "%CHROME%" --app=%URL% --window-size=1600,1000
) else (
  start "" "%URL%"
)

echo.
echo Los dos procesos quedaron vivos: demonio en 9002 y HTTP de web/ en 8080.
echo Esta ventana los mantiene juntos. Una tecla los detiene.
echo.
pause
echo Deteniendo demonio y servidor HTTP...
taskkill /F /IM vitalgrid_daemon.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq VitalGrid HTTP*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq VitalGrid Daemon*" >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8080 .*LISTENING"') do taskkill /F /PID %%P >nul 2>&1
echo Listo.
exit /b 0
