@echo off
chcp 65001
echo.
echo ========================================
echo    正在启动 STGC3000 后端开发服务器...
echo ========================================
echo.

REM 检查 node_modules 是否存在
if not exist "node_modules" (cp 65001
echo.
echo ========================================
echo    正在启动 STGC3000 后端开发服务器...
echo ========================================
echo.

REM 切换到当前脚本所在的目录
cd /d "%~dp0"

REM 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [!] 依赖包 (node_modules) 未找到。
    echo [*] 正在自动执行 npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] 依赖包安装失败，请检查错误信息。
        pause
        exit /b 1
    )
    echo [✓] 依赖包安装完成。
    echo.
)

REM 检查 .env 文件是否存在
if not exist ".env" (
    echo [!] 配置文件 (.env) 不存在。
    echo [*] 正在从 .env.example 创建...
    if exist ".env.example" (
        copy .env.example .env >nul
        echo [✓] .env 文件已创建。
        echo [IMPORTANT] 请打开 server/.env 文件并填入您的 DEEPSEEK_API_KEY。
    ) else (
        echo [ERROR] 模板文件 .env.example 未找到，无法自动创建 .env。
        echo 请手动创建 .env 文件。
    )
    pause
)

REM 启动开发服务器 (使用 nodemon) - 暂时禁用
REM echo [*] 正在使用 nodemon 启动服务器 (自动重载)...
REM call npm run dev

REM 启动开发服务器 (使用 node 直接启动)
echo [*] 正在使用 node 启动服务器...
call npm start

pause
