@echo off
chcp 65001 >nul 2>&1

echo ========================================
echo    STGC3000 项目健康检查
echo ========================================
echo.

echo 🔍 检查项目状态...
echo.

echo 1. 环境检查
echo ────────────────────────────────────────
node --version >nul 2>&1 && echo [✓] Node.js 已安装 || echo [✗] Node.js 未安装
npm --version >nul 2>&1 && echo [✓] npm 已安装 || echo [✗] npm 未安装
ollama --version >nul 2>&1 && echo [✓] Ollama 已安装 || echo [✗] Ollama 未安装

echo.
echo 2. AI 模型检查
echo ────────────────────────────────────────
ollama list 2>nul | findstr "llama3.1" >nul && echo [✓] llama3.1 模型可用 || echo [✗] llama3.1 模型未安装
ollama list 2>nul | findstr "qwen" >nul && echo [✓] Qwen 模型可用 || echo [○] Qwen 模型未安装（可选）

echo.
echo 3. 项目文件结构检查
echo ────────────────────────────────────────
if exist "server\package.json" (echo [✓] 后端配置文件存在) else (echo [✗] 后端配置文件缺失)
if exist "client\package.json" (echo [✓] 前端配置文件存在) else (echo [✗] 前端配置文件缺失)
if exist "server\database\database.js" (echo [✓] 数据库模块存在) else (echo [✗] 数据库模块缺失)
if exist "server\utils\aiService.js" (echo [✓] AI服务模块存在) else (echo [✗] AI服务模块缺失)

echo.
echo 4. 数据库检查
echo ────────────────────────────────────────
if exist "server\database\knowledge_platform.db" (echo [✓] 数据库文件存在) else (echo [○] 数据库文件不存在（首次运行时正常）)

echo.
echo 5. 上传目录检查
echo ────────────────────────────────────────
if exist "server\uploads" (echo [✓] 上传目录存在) else (echo [○] 上传目录不存在（运行时会自动创建）)

echo.
echo 6. 依赖状态检查
echo ────────────────────────────────────────
cd /d "%~dp0server"
if exist "node_modules" (echo [✓] 后端依赖已安装) else (echo [✗] 后端依赖未安装 - 请运行 fix-issues.bat)
cd /d "%~dp0client"
if exist "node_modules" (echo [✓] 前端依赖已安装) else (echo [✗] 前端依赖未安装 - 请运行 fix-issues.bat)

echo.
echo 7. 端口状态检查
echo ────────────────────────────────────────
netstat -an | findstr ":3001" >nul && echo [!] 端口3001已被占用 || echo [✓] 端口3001可用
netstat -an | findstr ":3000" >nul && echo [!] 端口3000已被占用 || echo [✓] 端口3000可用

echo.
echo ========================================
echo   健康检查完成
echo ========================================
echo.
echo 说明：
echo [✓] 正常   [✗] 错误   [○] 可选   [!] 警告
echo.
echo 如发现问题，请运行 fix-issues.bat 进行修复
echo.
pause
