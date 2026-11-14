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

title Z.E.U.S - servidor local
cd /d "%~dp0web"

REM --- Buscar Python, con los dos nombres habituales en Windows -------------
where python >nul 2>&1 && set PY=python
if not defined PY where py >nul 2>&1 && set PY=py
if not defined PY (
  echo.
  echo   No encontre Python. Instalalo desde python.org, o abri la carpeta
  echo   web/ con Live Server desde VS Code.
  echo.
  pause
  exit /b 1
)

REM --- Si el 5500 esta ocupado, usar el 5501 --------------------------------
set PUERTO=5500
netstat -ano | findstr /r /c:":5500 .*LISTENING" >nul 2>&1 && set PUERTO=5501
set URL=http://localhost:%PUERTO%

REM --- Buscar Chrome para abrir en modo app ---------------------------------
REM  --app= abre una ventana sin barra de direcciones, sin pestanas y sin
REM  botones de navegacion: se ve como un programa, no como una pagina web.
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe

echo.
echo    Z.E.U.S   %URL%
echo.
if defined CHROME (
  echo    Abriendo en modo app.
) else (
  echo    No encontre Chrome: abro en el navegador por defecto.
)
echo.
echo    Dejar esta ventana abierta mientras usas el cockpit.
echo    Para cerrar:  Ctrl + C
echo.

REM --- Abrir recien cuando el servidor este arriba --------------------------
if defined CHROME (
  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start """" ""%CHROME%"" --app=%URL% --window-size=1600,1000"
) else (
  start "" /b cmd /c "timeout /t 2 /nobreak >nul & start %URL%"
)

%PY% -m http.server %PUERTO%
