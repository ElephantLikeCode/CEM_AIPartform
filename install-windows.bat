@echo off
chcp 65001
echo ========================================
echo    STGC3000 AI Learning Platform - Windows Installation
echo ========================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not detected
    echo Please install Node.js first: https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js is installed
node --version
echo.

echo ========================================
echo    Step 1: Installing Backend Dependencies
echo ========================================
cd /d "%~dp0server"
echo Current directory: %cd%

echo Installing basic dependencies...
call npm install express cors body-parser dotenv
if %errorlevel% neq 0 (
    echo [ERROR] Backend basic dependencies installation failed!
    pause
    exit /b 1
)

echo Installing file processing dependencies...
call npm install multer sqlite3 pdf-parse mammoth axios uuid fs-extra bcrypt jsonwebtoken
if %errorlevel% neq 0 (
    echo [ERROR] Backend extended dependencies installation failed!
    pause
    exit /b 1
)

echo Installing development dependencies...
call npm install --save-dev nodemon
if %errorlevel% neq 0 (
    echo [ERROR] Backend development dependencies installation failed!
    pause
    exit /b 1
)

echo [✓] Backend dependencies installation completed!
echo.

echo ========================================
echo    Step 2: Creating Required Directories
echo ========================================
if not exist "routes" mkdir routes
if not exist "models" mkdir models
if not exist "uploads" mkdir uploads
if not exist "scripts" mkdir scripts
echo [✓] Directory creation completed!
echo.

echo ========================================
echo    Step 3: Installing Frontend Dependencies
echo ========================================
cd /d "%~dp0client"
echo Current directory: %cd%

echo Installing basic dependencies...
call npm install react react-dom
if %errorlevel% neq 0 (
    echo [ERROR] Frontend basic dependencies installation failed!
    pause
    exit /b 1
)

echo Installing UI framework...
call npm install antd axios react-router-dom @ant-design/icons
if %errorlevel% neq 0 (
    echo [ERROR] Frontend UI dependencies installation failed!
    pause
    exit /b 1
)

echo Installing development dependencies...
call npm install --save-dev @types/react @types/react-dom @vitejs/plugin-react typescript vite eslint
if %errorlevel% neq 0 (
    echo [ERROR] Frontend development dependencies installation failed!
    pause
    exit /b 1
)

echo [✓] Frontend dependencies installation completed!
echo.

echo ========================================
echo    Installation Completed!
echo ========================================
echo.
echo Next steps:
echo 1. Start backend server:
echo    cd server
echo    npm start
echo.
echo 2. Start frontend application (new command window):
echo    cd client  
echo    npm run dev
echo.
echo 3. Open in browser:
echo    http://localhost:3000
echo.
echo Press any key to continue...
pause >nul