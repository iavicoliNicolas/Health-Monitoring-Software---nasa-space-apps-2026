@echo off
REM El arranque completo (compilacion, demonio en 9002 y HTTP de web/)
REM vive en run.bat. Este acceso queda para el doble clic de siempre.
cd /d "%~dp0"
call "%~dp0run.bat"
