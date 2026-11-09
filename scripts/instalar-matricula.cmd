@echo off
setlocal DisableDelayedExpansion
title Instalar Matricula
echo Instalacion de Matricula en este PC
echo.
if not exist "%~dp0ENTREGA.json" goto incomplete
if not exist "%~dp0INICIAR-EN-EL-SERVIDOR.ps1" goto incomplete

set "PSModulePath=%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR-EN-EL-SERVIDOR.ps1"
set "INSTALL_RESULT=%errorlevel%"
if not "%INSTALL_RESULT%"=="0" goto failed
echo.
echo Instalacion lista. Puedes cerrar esta ventana.
pause
exit /b 0

:incomplete
echo No se encontraron los archivos del instalador.
echo Extrae TODO el ZIP y abre INSTALAR MATRICULA desde la carpeta extraida.
pause
exit /b 1

:failed
echo.
echo No se completo la instalacion. Revisa el mensaje de arriba o ABRIR-PRIMERO.md.
pause
exit /b %INSTALL_RESULT%
