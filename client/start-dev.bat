@echo off
echo 正在启动 STGC3000 客户端开发服务器...
echo.

REM 切换到客户端目录
cd /d "c:\Users\elephant\OneDrive\Desktop\STGC3000\partform\client"

REM 检查 node_modules 是否存在
if not exist "node_modules" (
    echo 正在安装依赖包...
    npm install
)

REM 启动开发服务器
echo 启动开发服务器...
npm run dev

pause
