@echo off
chcp 65001 >nul 2>&1

:main_menu
cls
echo ========================================
echo    STGC3000 AI Learning Platform Startup
echo ========================================
echo.

echo Choose startup method:
echo 1. Start Backend Server
echo 2. Start Frontend Application  
echo 3. Start Both (Recommended)
echo 4. Restart Backend Server
echo 5. Restart Frontend Application
echo 6. Restart Both Services
echo 7. Exit
echo.
set /p choice=Please select (1-7): 

if "%choice%"=="1" goto start_backend
if "%choice%"=="2" goto start_frontend
if "%choice%"=="3" goto start_both
if "%choice%"=="4" goto restart_backend
if "%choice%"=="5" goto restart_frontend
if "%choice%"=="6" goto restart_both
if "%choice%"=="7" goto exit
goto invalid

:start_backend
echo.
echo Starting backend server in development mode...
REM start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm run dev"
start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm start"
echo Backend server is starting, check new window...
echo.
echo Press Enter to return to main menu...
pause >nul
goto main_menu

:start_frontend
echo.
echo Starting frontend application...
start "STGC3000 Frontend App" /d "%~dp0client" cmd /k "npm run dev"
echo Frontend application is starting, check new window...
echo.
echo Press Enter to return to main menu...
pause >nul
goto main_menu

:start_both
echo.
echo Starting backend server in development mode...
REM start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm run dev"
start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm start"

timeout /t 2 >nul

echo Starting frontend application...
start "STGC3000 Frontend App" /d "%~dp0client" cmd /k "npm run dev"

echo.
echo Services are starting...
echo.
echo Service addresses:
echo Backend API: http://localhost:3001
echo Frontend App: http://localhost:5173 (Vite dev server)
echo.
echo After startup, visit the frontend URL in your browser
echo.
echo Press Enter to return to main menu...
pause >nul
goto main_menu

:restart_backend
echo.
echo Restarting backend server...
echo Closing existing backend processes...
taskkill /f /im node.exe /fi "WINDOWTITLE eq STGC3000 Backend Server*" >nul 2>&1
timeout /t 2 >nul
echo Starting new backend server...
REM start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm run dev"
start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm start"
echo Backend server restarted, check new window...
echo.
echo Press Enter to return to main menu...
pause >nul
goto main_menu

:restart_frontend
echo.
echo Restarting frontend application...
echo Closing existing frontend processes...
taskkill /f /im node.exe /fi "WINDOWTITLE eq STGC3000 Frontend App*" >nul 2>&1
timeout /t 2 >nul
echo Starting new frontend application...
start "STGC3000 Frontend App" /d "%~dp0client" cmd /k "npm run dev"
echo Frontend application restarted, check new window...
echo.
echo Press Enter to return to main menu...
pause >nul
goto main_menu

:restart_both
echo.
echo Restarting both services...
echo Closing existing processes...
taskkill /f /im node.exe /fi "WINDOWTITLE eq STGC3000 Backend Server*" >nul 2>&1
taskkill /f /im node.exe /fi "WINDOWTITLE eq STGC3000 Frontend App*" >nul 2>&1
timeout /t 3 >nul

echo Starting backend server...
REM start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm run dev"
start "STGC3000 Backend Server" /d "%~dp0server" cmd /k "npm start"

timeout /t 2 >nul

echo Starting frontend application...
start "STGC3000 Frontend App" /d "%~dp0client" cmd /k "npm run dev"

echo.
echo Both services restarted successfully!
echo.
echo Service addresses:
echo Backend API: http://localhost:3001
echo Frontend App: http://localhost:3000
echo.
echo Press Enter to return to main menu...
pause >nul
goto main_menu

:invalid
echo Invalid selection, please try again.
echo.
echo Press Enter to continue...
pause >nul
goto main_menu

:exit
echo.
echo Do you want to close all running services before exit? (Y/N)
set /p close_services=Enter your choice: 
if /i "%close_services%"=="Y" (
    echo Closing all services...
    taskkill /f /im node.exe /fi "WINDOWTITLE eq STGC3000 Backend Server*" >nul 2>&1
    taskkill /f /im node.exe /fi "WINDOWTITLE eq STGC3000 Frontend App*" >nul 2>&1
    echo All services closed.
)
echo.
echo Thank you for using STGC3000 AI Learning Platform!
timeout /t 2 >nul
exit
