@echo off
setlocal DisableDelayedExpansion
title Actualizar Matricula
echo Actualizacion de Matricula en este PC
echo.
if not exist "%~dp0ENTREGA.json" goto incomplete
if not exist "%~dp0ACTUALIZAR-EN-EL-SERVIDOR.ps1" goto incomplete
set "PSModulePath=%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0ACTUALIZAR-EN-EL-SERVIDOR.ps1"
set "UPDATE_RESULT=%errorlevel%"
if not "%UPDATE_RESULT%"=="0" goto failed
echo.
echo Actualizacion lista. La base y el puerto se conservaron.
pause
exit /b 0
:incomplete
echo No se encontraron los archivos del actualizador. Extrae todo el ZIP.
pause
exit /b 1
:failed
echo.
echo No se completo la actualizacion. El respaldo y los datos deben conservarse.
pause
exit /b %UPDATE_RESULT%
