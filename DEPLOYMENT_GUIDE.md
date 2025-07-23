# STGC3000 AI Learning Platform - 部署指南 v2.3.0

本文档为 STGC3000 AI 学习平台提供了一份完整的、从零开始的环境配置与部署手册，同时包含了常见问题的解决方案。

---

## 目录
1.  [环境要求](#-1-环境要求)
2.  [环境配置步骤](#-2-环境配置步骤)
3.  [项目部署流程](#-3-项目部署流程)
4.  [常见问题及对策 (FAQ)](#-4-常见问题及对策-faq)

---

## 📋 1. 环境要求

在开始之前，请确保您的系统满足以下要求：

- **操作系统**: Windows 10/11, macOS, or Linux
- **Node.js**: `16.0.0` 或更高版本
- **npm**: `8.0.0` 或更高版本
- **Git**: 最新版本
- **AI服务 (二选一)**:
    - **Ollama**: 用于本地运行AI模型。
    - **DeepSeek API Key**: 用于使用在线AI服务。
- **代码编辑器**: 推荐 [Visual Studio Code](https://code.visualstudio.com/)

---

## ⚙️ 2. 环境配置步骤

### a. 安装 Git
- **Windows**: 下载并安装 [Git for Windows](https://git-scm.com/download/win)。
- **macOS**: 如果您安装了 Xcode Command Line Tools，Git 已包含在内。如果没有，请运行 `git --version` 进行安装。
- **Linux**: 使用包管理器安装，例如 `sudo apt-get install git` (Debian/Ubuntu) 或 `sudo yum install git` (Fedora/RHEL)。

### b. 安装 Node.js 和 npm
我们推荐使用 `nvm` (Node Version Manager) 来管理 Node.js 版本。
- **Windows**: 安装 [nvm-windows](https://github.com/coreybutler/nvm-windows)。
- **macOS/Linux**: 运行 [官方安装脚本](https://github.com/nvm-sh/nvm#installing-and-updating)。

安装 `nvm` 后，运行以下命令来安装和使用推荐的 Node.js 版本：
```bash
nvm install 18
nvm use 18
```
`npm` 会随 Node.js 一起安装。您可以通过运行 `node -v` 和 `npm -v` 来验证安装。

### c. 配置AI服务 (选择一种)

#### 方案一: 设置 Ollama (本地AI)
1.  **下载并安装 Ollama**: 访问 [Ollama 官网](https://ollama.com/) 并根据您的操作系统下载安装。
2.  **拉取AI模型**: 打开终端或命令行，运行以下命令来下载推荐的 `llama3.1` 模型：
    ```bash
    ollama pull llama3.1
    ```
3.  **验证服务**: 确保 Ollama 服务正在后台运行。

#### 方案二: 获取 DeepSeek API Key (在线AI)
1.  **注册账户**: 访问 [DeepSeek 官网](https://www.deepseek.com/)。
2.  **创建 API Key**: 登录后，在您的账户设置中找到 API 密钥管理页面，并创建一个新的 API Key。
3.  **保存密钥**: 妥善保管好您的 API Key，稍后将用于项目配置。

---

## 🚀 3. 项目部署流程

### a. 获取项目代码
使用 Git 克隆项目仓库到您的本地计算机：
```bash
git clone <你的项目仓库URL>
cd CEM_AIPartform
```

### b. 配置后端服务 (`server`)
1.  **导航到后端目录**:
    ```bash
    cd server
    ```
2.  **创建 `.env` 配置文件**:
    在 `server` 目录下创建一个名为 `.env` 的文件。这是存放敏感配置的地方。复制以下内容到文件中，并根据您的设置进行修改：
    ```env
    # 服务器端口
    PORT=3000

    # JWT 密钥 (请使用一个长且随机的字符串以保证安全)
    JWT_SECRET=your_super_secret_and_long_jwt_key

    # AI 服务提供商配置 (选择 'ollama' 或 'deepseek')
    AI_SERVICE_PROVIDER=ollama

    # DeepSeek API Key (如果使用 DeepSeek)
    DEEPSEEK_API_KEY=your_deepseek_api_key_here

    # Ollama 服务地址 (如果使用 Ollama)
    OLLAMA_BASE_URL=http://localhost:11434
    ```
    **重要**: 确保 `JWT_SECRET` 是一个独特的、难以猜测的字符串。

3.  **安装后端依赖**:
    ```bash
    npm install
    ```

4.  **初始化数据库**:
    项目使用 `better-sqlite3`，数据库和表结构会在首次运行时自动创建。如果需要手动初始化或重置，请运行 `database.js` 中的初始化逻辑或相关脚本。

5.  **启动后端服务**:
    ```bash
    npm start
    ```
    如果一切正常，您应该会在终端看到类似 `Server is running on port 3000` 的消息。

### c. 配置前端服务 (`client`)
1.  **打开一个新的终端**。
2.  **导航到前端目录**:
    ```bash
    cd client
    ```
3.  **安装前端依赖**:
    ```bash
    npm install
    ```
4.  **启动前端开发服务器**:
    ```bash
    npm run dev
    ```
    启动后，终端会显示一个本地访问地址，通常是 `http://localhost:5173`。

### d. 访问平台
打开您的浏览器，访问前端开发服务器提供的地址 (例如 `http://localhost:5173`)。您现在应该能看到登录页面，并可以开始使用平台了。

---

## ❓ 4. 常见问题及对策 (FAQ)

#### Q1: 启动后端时，出现 `Error: listen EADDRINUSE: address already in use :::3000` 错误。
- **原因**: 端口 `3000` 已被其他应用程序占用。
- **对策**:
    1.  修改 `server/.env` 文件中的 `PORT` 值为另一个未被占用的端口 (例如 `3001`)。
    2.  或者，找到并终止占用该端口的进程。

#### Q2: 前端无法连接到后端API，浏览器控制台出现CORS跨域错误。
- **原因**: 后端没有正确配置以允许来自前端域的请求。
- **对策**:
    1.  检查 `server/index.js` 或 `server/app.js` 中 `cors` 中间件的配置。
    2.  确保 `origin` 选项包含了您的前端地址 (例如 `http://localhost:5173`)。

#### Q3: AI功能无响应或报错。
- **原因**: AI服务配置不正确或服务未运行。
- **对策**:
    1.  **检查 `server/.env` 文件**:
        - `AI_SERVICE_PROVIDER` 是否正确设置为 `ollama` 或 `deepseek`。
        - 如果是 `ollama`，`OLLAMA_BASE_URL` 是否正确。
        - 如果是 `deepseek`，`DEEPSEEK_API_KEY` 是否有效。
    2.  **检查AI服务状态**:
        - **Ollama**: 确保 Ollama 服务正在您的计算机上运行，并且已成功拉取所需模型。
        - **DeepSeek**: 检查您的网络连接，并确认 API Key 未过期或被禁用。

#### Q4: 数据库操作失败，出现 `SQLITE_CANTOPEN` 或类似错误。
- **原因**: 数据库文件路径不正确，或程序没有权限读写该文件。
- **对策**:
    1.  确认 `server/database/knowledge_platform.db` 文件存在。
    2.  检查应用程序运行的用户是否对 `server/database` 目录及其中的文件具有读写权限。

#### Q5: `npm install` 安装依赖失败。
- **原因**: 网络问题、npm缓存问题或依赖版本冲突。
- **对策**:
    1.  **清理缓存**: 运行 `npm cache clean --force`。
    2.  **删除旧的依赖和锁定文件**: 删除项目中的 `node_modules` 文件夹和 `package-lock.json` 文件。
    3.  **重新安装**: 再次运行 `npm install`。
    4.  **检查网络**: 确保您可以访问 npm 仓库。如果在使用代理，请配置 npm 代理。

#### Q6: 用户无法登录，或登录后立即被登出。
- **原因**: JWT 密钥配置问题或浏览器 Cookie/Storage 问题。
- **对策**:
    1.  **检查 `server/.env`**: 确保 `JWT_SECRET` 已设置并且在后端服务重启后没有改变。
    2.  **清理浏览器缓存**: 清除浏览器中与该网站相关的 Cookie 和本地存储，然后重试。

#### Q7: 上传文件时AI分析失败，并出现 `HeadersTimeoutError`。
- **原因**: 这是AI服务超时错误。通常是因为本地Ollama服务所在的机器性能不足，处理大型文档或复杂请求时响应过慢。
- **对策**:
    1.  **验证Ollama服务**: 在新设备上打开终端，运行 `ollama list` 确认服务正在运行且模型已下载。运行 `ollama run llama3.1 "say hi"` 测试模型是否能正常响应。
    2.  **检查系统资源**: 打开任务管理器，在Ollama分析文档时监控CPU和内存使用情况。如果资源占用率持续100%，说明硬件性能是瓶颈。
    3.  **切换到DeepSeek**: 如果本地硬件性能不足，最简单的解决方案是使用在线AI服务。
        - 打开 `server/.env` 文件。
        - 将 `AI_SERVICE_PROVIDER` 的值从 `ollama` 修改为 `deepseek`。
        - 确保 `DEEPSEEK_API_KEY` 已正确填写。
        - 重启后端服务。
    4.  **增加超时时间 (备选方案)**: 如果您坚持使用Ollama，可以尝试延长后端服务的请求超时时间。
        - 打开 `server/utils/aiService.js` 文件。
        - 找到 `ollama.chat` 或 `ollama.generate` 的调用。
        - 在请求选项中添加 `keep_alive` 参数，例如 `{ model: 'llama3.1', stream: false, options: { keep_alive: '10m' } }`。这会将超时延长到10分钟。但请注意，这并不能解决根本的性能问题。

#### Q8: 我复制了整个项目文件夹，但只有部分数据（如用户和AI对话）存在，而我的文件列表和学习记录都消失了。
- **原因**: 这是一个非常特殊但常见的问题。这几乎可以肯定是由于您的应用程序在新设备上使用了一个**全新的、自动生成的数据库文件**，而不是您从旧设备复制过来的那一个。
    -   当服务器启动时，如果它没有找到或无法读取 `knowledge_platform.db` 文件，它会自动创建一个空的数据库作为后备。
    -   您在新设备上登录并进行了一些操作（如AI对话），这些新操作的数据（用户、对话记录）被写入了这个**新的空数据库**中。
    -   而您原有的文件列表和学习记录存储在旧的数据库文件中，这个文件实际上并未被应用程序使用。

-   **诊断步骤**:
    1.  **停止后端服务** (非常重要，防止文件被锁定)。
    2.  在**新设备**上，找到 `server/database/knowledge_platform.db` 文件。
    3.  右键点击该文件，选择“属性”，查看**“修改日期”**。如果这个日期是您在新设备上启动服务器之后的日期，那就证明这是一个新创建的文件。同时，文件大小可能只有几十KB。

-   **解决方案**:
    1.  在**新设备**上，**停止后端服务**。
    2.  回到您的**旧设备** (源设备)。
    3.  找到并复制 `server/database/knowledge_platform.db` 这一个文件。
    4.  将这个从旧设备复制的 `.db` 文件粘贴到**新设备**的 `server/database/` 目录下，**覆盖**掉那个新生成的空数据库文件。
    5.  在**新设备**上重新启动后端服务。现在，您的所有数据应该都回来了。

#### Q9: 我已经按照Q8的方法恢复了数据库，但启动后系统仍然清理掉了我的文件记录，显示"物理文件不存在"。
- **原因**: 这是跨设备迁移时的一个特殊问题。数据库中存储的文件路径是**绝对路径**（如 `D:\AI Partform\...`），当您复制到新设备时，新的项目路径可能完全不同（如 `C:\Users\...\CEM_AIPartform\...`）。系统的文件检测逻辑发现路径不匹配，就误认为"物理文件不存在"并自动清理了数据库记录。

- **预防措施** (在启动服务器前执行):
    1.  **临时禁用自动清理**: 在启动服务器前，打开 `server/database/database.js` 文件。
    2.  找到 `cleanupInvalidFileAssociations` 函数（约第234行）。
    3.  在函数开头添加一行：`return { cleaned: 0, total: 0 }; // 临时禁用清理`
    4.  保存文件并启动服务器。
    5.  进入系统，检查文件列表是否正常显示。
    6.  如果正常，说明问题确实是路径导致的。

- **永久解决方案** (修复路径问题):
    **方案一: 自动迁移脚本 (推荐)**
    1.  **停止后端服务**。
    2.  在 `server` 目录下运行迁移脚本：
        ```bash
        cd server
        npm run migrate-paths
        ```
    3.  脚本将自动将数据库中的绝对路径转换为相对路径。
    4.  **恢复自动清理功能**: 删除步骤1中添加的 `return` 语句。
    5.  重新启动服务器。
    
    **方案二: 手动SQL修复 (高级用户)**
    1.  **停止后端服务**。
    2.  打开 SQLite 数据库文件 `server/database/knowledge_platform.db`（推荐使用 [DB Browser for SQLite](https://sqlitebrowser.org/)）。
    3.  执行以下 SQL 查询来检查和修复路径：
        ```sql
        -- 查看当前的文件路径
        SELECT id, original_name, upload_path FROM uploaded_files;
        
        -- 批量更新路径（将绝对路径转换为相对路径）
        UPDATE uploaded_files 
        SET upload_path = REPLACE(upload_path, 'D:\AI Partform\CEM_AIPartform-main\server\', '')
        WHERE upload_path LIKE 'D:\AI Partform\CEM_AIPartform-main\server\%';
        
        -- 或者使用通用的替换方法（根据实际情况调整）
        UPDATE uploaded_files 
        SET upload_path = SUBSTR(upload_path, INSTR(upload_path, 'uploads\'))
        WHERE upload_path LIKE '%\uploads\%';
        ```
    4.  保存数据库更改。
    5.  **恢复自动清理功能**: 删除步骤1中添加的 `return` 语句。
    6.  重新启动服务器。

- **简化方案** (如果您不熟悉数据库操作):
    1.  **重新上传文件**: 如果文件不多，最简单的方法是删除数据库中的文件记录，然后重新上传文件。
    2.  **备份学习记录**: 在重新上传前，导出您的学习进度和AI对话记录。

#### Q10: 如何防止将来出现跨设备路径问题？
- **原因**: 从 v2.3.0 版本开始，系统已经**彻底简化**了路径处理逻辑，使用相对路径存储文件位置，彻底解决跨设备迁移的路径问题。

- **技术改进**:
    1.  **简化存储**: 文件上传时直接将绝对路径转换为相对路径存储（如 `uploads\filename.pdf`）
    2.  **智能读取**: 文件读取时自动将相对路径转换为绝对路径
    3.  **兼容性检查**: 文件检测逻辑同时支持新的相对路径和旧的绝对路径

- **新用户** (首次部署):
    1.  **无需特殊操作**: v2.3.0 及以后版本会自动使用相对路径存储，天然支持跨设备迁移。
    2.  **正常部署**: 按照本指南的标准流程部署即可。

- **现有用户** (从旧版本升级):
    1.  **一键迁移**: 运行 `npm run migrate-paths` 将现有数据转换为相对路径。
    2.  **验证结果**: 检查系统功能是否正常，特别是文件上传和学习页面。
    3.  **享受无缝迁移**: 迁移完成后，将来的跨设备部署将不再有路径问题。

- **最佳实践**:
    1.  **定期备份**: 定期备份整个项目文件夹，包括 `uploads` 目录和数据库文件。
    2.  **完整复制**: 迁移时确保复制完整的项目结构，不要只复制代码文件。
    3.  **验证迁移**: 迁移后运行 `npm run migrate-paths` 来验证和修复任何潜在的路径问题（脚本是幂等的，多次运行无害）。

#### Q11: 系统的路径处理逻辑是如何工作的？
- **简化设计原理**:
    1.  **存储**: `uploads\filename.pdf` （相对于server目录的相对路径）
    2.  **读取**: 自动转换为 `D:\your-project\server\uploads\filename.pdf` （绝对路径）
    3.  **检测**: 文件存在性检查时自动处理路径转换

- **代码层面的改进**:
    ```javascript
    // 存储时：将multer的绝对路径转换为相对路径
    uploadPath: getRelativeUploadPath(req.file.path)
    
    // 读取时：将相对路径转换为绝对路径
    const absolutePath = getAbsoluteUploadPath(fileData.uploadPath)
    ```

- **向后兼容**:
    - 系统同时支持新的相对路径和旧的绝对路径
    - 迁移脚本可以安全地多次运行
    - 现有功能不受影响
