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
