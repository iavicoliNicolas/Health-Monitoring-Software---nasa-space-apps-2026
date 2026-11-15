@echo off
REM ===========================================================================
REM  Z.E.U.S - cockpit
REM  Doble clic y listo: levanta el servidor local y abre la app.
REM
REM  Por que hace falta un servidor y no alcanza con abrir el index.html:
REM  el navegador bloquea fetch() y la camara cuando la pagina viene de
REM  file://. Necesita http://localhost para tratarla como origen seguro.
REM  Eso vale igual para cualquier app de escritorio: por dentro siempre
REM  hay un navegador.
REM ===========================================================================

setlocal
title Z.E.U.S - servidor local
cd /d "%~dp0web"

REM  El .bat se llama a si mismo con --abrir para abrir el navegador dos
REM  segundos despues, mientras esta ventana queda sirviendo los archivos.
if /i "%~1"=="--abrir" goto abrir

REM --- Buscar Python, con los dos nombres habituales en Windows -------------
where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py"
if not defined PY (
  echo.
  echo   No encontre Python. Instalalo desde python.org, o abri la carpeta
  echo   web/ con Live Server desde VS Code.
  echo.
  pause
  exit /b 1
)

REM --- Si el 5500 esta ocupado, usar el 5501 --------------------------------
set "PUERTO=5500"
netstat -ano | findstr /r /c:":5500 .*LISTENING" >nul 2>&1 && set "PUERTO=5501"

echo.
echo    Z.E.U.S   http://localhost:%PUERTO%
echo.
echo    Dejar esta ventana abierta mientras usas el cockpit.
echo    Para cerrar:  Ctrl + C
echo.

start "" /b cmd /c ""%~f0" --abrir %PUERTO%"
%PY% -m http.server %PUERTO%
exit /b

REM ===========================================================================
:abrir
REM  Esperar a que el servidor este escuchando antes de abrir la ventana.
timeout /t 2 /nobreak >nul

set "URL=http://localhost:%~2"

REM  --app= abre una ventana sin barra de direcciones, sin pestanas y sin
REM  botones de navegacion: se ve como un programa, no como una pagina web.
REM  Las comillas en el set son obligatorias: las rutas tienen espacios
REM  ("C:\Program Files\...") y sin comillas cmd corta en el primer espacio.
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --app=%URL% --window-size=1600,1000
) else (
  start "" "%URL%"
)
exit /b
