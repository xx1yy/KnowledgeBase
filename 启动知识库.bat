@echo off
chcp 65001 > nul 2>&1

REM Change to script directory
cd /d "%~dp0"

REM Kill existing python processes to free the port
taskkill /F /IM python.exe > nul 2>&1
timeout /t 2 /nobreak > nul 2>&1

REM Remove old port file to avoid race condition
if exist server_port.txt del /f /q server_port.txt > nul 2>&1

REM Start server in a new window
set PY=C:\Users\20132\.workbuddy\binaries\python\versions\3.13.12\python.exe
start "KB-Server" "%PY%" server.py

REM Wait for server_port.txt to appear
set PORT=
set MAXWAIT=15
:WAIT_PORT
if exist server_port.txt goto PORT_FOUND
timeout /t 1 /nobreak > nul 2>&1
set /a MAXWAIT=%MAXWAIT%-1
if %MAXWAIT% LEQ 0 goto PORT_TIMEOUT
goto WAIT_PORT

:PORT_FOUND
set /p PORT=<server_port.txt
if "%PORT%"=="" goto PORT_TIMEOUT

start "" "http://localhost:%PORT%/"
echo Server running at: http://localhost:%PORT%/
echo Close the "KB-Server" window to stop.
pause > nul
goto END

:PORT_TIMEOUT
echo Server start timeout! Check server.py for errors.
pause

:END
