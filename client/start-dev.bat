@echo off
chcp 65001
echo.
echo ========================================
echo    正在启动 STGC3000 客户端开发服务器...
echo ========================================
echo.

REM 检查 node_modules 是否存在
if not exist "node_modules" (cp 65001
echo.
echo ========================================
echo    正在启动 STGC3000 客户端开发服务器...
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

REM 启动 Vite 开发服务器
echo [*] 正在启动 Vite 开发服务器...
call npm run dev

pause
