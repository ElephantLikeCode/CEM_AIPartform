@echo off
chcp 65001
echo.
echo ============================================================
echo    STGC3000 AI Learning Platform - 统一环境安装脚本
echo ============================================================
echo.
echo  此脚本将自动完成以下操作:
echo  1. 检查 Node.js 环境。
echo  2. 安装后端和前端的所有必需依赖包。
echo  3. 自动创建后端 .env 配置文件 (如果不存在)。
echo.
echo  按任意键开始安装...
pause >nul
echo.

REM --- 检查 Node.js 环境 ---
echo [*] 正在检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js 环境。
    echo [!] 请先访问 https://nodejs.org/ 下载并安装 Node.js (推荐LTS版本)。
    pause
    exit /b 1
)
echo [✓] Node.js 环境正常。
node --version
echo.

REM --- 安装后端依赖 ---
echo ========================================
echo    步骤 1: 安装后端依赖
echo ========================================
cd /d "%~dp0server"
echo [*] 当前目录: %cd%
echo [*] 正在安装后端依赖包 (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] 后端依赖安装失败，请检查上方的错误信息。
    pause
    exit /b 1
)
echo [✓] 后端依赖安装完成!
echo.

REM --- 创建后端 .env 文件 ---
echo ========================================
echo    步骤 2: 检查并创建 .env 配置文件
echo ========================================
if not exist ".env" (
    echo [!] 配置文件 (.env) 不存在。
    if exist ".env.example" (
        echo [*] 正在从 .env.example 模板创建...
        copy .env.example .env >nul
        echo [✓] .env 文件已成功创建于 `server` 目录。
        echo.
        echo [IMPORTANT] 安装完成后，请务必打开 `server/.env` 文件，
        echo             并填入您自己的 `DEEPSEEK_API_KEY`。
    ) else (
        echo [WARNING] 未找到 .env.example 模板文件，无法自动创建 .env。
        echo             请在安装后手动创建 `server/.env` 文件。
    )
) else (
    echo [✓] 配置文件 .env 已存在，无需创建。
)
echo.

REM --- 安装前端依赖 ---
echo ========================================
echo    步骤 3: 安装前端依赖
echo ========================================
cd /d "%~dp0client"
echo [*] 当前目录: %cd%
echo [*] 正在安装前端依赖包 (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] 前端依赖安装失败，请检查上方的错误信息。
    pause
    exit /b 1
)
echo [✓] 前端依赖安装完成!
echo.

echo ============================================================
echo    🎉 环境安装成功!
echo ============================================================
echo.
echo  后续操作:
echo.
echo  1. (重要) 如果是首次安装，请打开 `server/.env` 文件并填入您的API密钥。
echo.
echo  2. 启动开发环境:
echo     - 直接运行根目录下的 `start-windows.bat` 即可一键启动前后端。
echo.
echo  3. 如果需要单独启动:
echo     - 后端: 进入 `server` 目录, 运行 `start-dev.bat`
echo     - 前端: 进入 `client` 目录, 运行 `start-dev.bat`
echo.
echo  感谢使用! 按任意键退出...
pause >nul