# STGC3000 Part Form - 客户端应用

基于 React + TypeScript + Vite 构建的前端应用程序。

## 环境要求

### 必需软件
- **Node.js**: 版本 16.0 或更高 ([下载地址](https://nodejs.org/))
- **npm**: 通常随 Node.js 一起安装
- **Git**: 用于版本控制 ([下载地址](https://git-scm.com/))

### 验证安装
```bash
node --version    # 应显示 v16.0.0 或更高
npm --version     # 应显示版本号
```

## 项目设置

### 1. 克隆项目（如果需要）
```bash
git clone <repository-url>
cd STGC3000/partform/client
```

### 2. 安装依赖
```bash
# 使用 npm
npm install

# 如果是新项目，可能需要安装基础依赖
npm install react react-dom
npm install --save-dev @vitejs/plugin-react vite typescript @types/react @types/react-dom

# 或使用 yarn（如果安装了）
yarn install
```

## 运行项目

### 完整启动流程

#### 步骤 1: 启动后端服务器
```bash
# 导航到后端目录
cd ../server

# 安装后端依赖（首次运行）
npm install

# 如果依赖缺失，手动安装
npm install express cors
npm install --save-dev nodemon

# 启动后端服务器（选择其中一种）
npm start            # 生产模式
# 或
npm run dev          # 开发模式（支持热重载）

# 确保后端运行在 http://localhost:3001
```

#### 步骤 2: 启动前端开发服务器
```bash
# 返回到客户端目录
cd ../client

# 检查可用脚本
npm run

# 启动前端开发服务器（选择其中一种）
npm run dev          # Vite 开发服务器
# 或
npm start            # 替代启动命令
# 或
npx vite             # 直接运行 Vite
```

#### 步骤 3: 访问应用
- 打开浏览器
- 访问: `http://localhost:3000`
- 应用将自动代理 API 请求到后端

## 可用脚本

```bash
npm run dev        # 启动开发服务器（端口 3000）
npm run build      # 构建生产版本到 dist/ 目录
npm run preview    # 预览生产构建版本
npm run lint       # 运行代码检查（如果配置了）
```

## 项目配置

### 端口配置
- **前端开发服务器**: `http://localhost:3000`
- **后端 API 服务器**: `http://localhost:3001`
- **API 代理**: `/api/*` 请求自动转发到后端

### 开发环境特性
- **热重载**: 文件修改后自动刷新浏览器
- **TypeScript 支持**: 实时类型检查
- **API 代理**: 自动处理跨域请求

## 故障排除

### 常见问题

#### 0. npm 安全漏洞
```bash
# 查看漏洞详情
npm audit

# 自动修复（推荐）
npm audit fix

# 强制修复（可能有破坏性更改）
npm audit fix --force

# 手动更新特定包
npm update package-name
```

#### 0. 前端启动问题
```bash
# 如果提示 "Missing script: dev"
# 解决方案 1: 检查可用脚本
npm run

# 解决方案 2: 直接运行 Vite
npx vite

# 解决方案 3: 安装 Vite 依赖
npm install --save-dev vite @vitejs/plugin-react

# 解决方案 4: 使用替代命令
npm start
```

#### 0. 后端启动问题
```bash
# 如果提示 "Cannot find module 'express'"
# 解决方案 1: 安装缺失的依赖
npm install express cors

# 解决方案 2: 重新安装所有依赖
npm install

# 如果提示 "nodemon: command not found"
# 解决方案 3: 安装 nodemon
npm install --save-dev nodemon

# 解决方案 4: 使用生产模式启动
npm start
```

#### 1. 端口被占用
```bash
# 错误: EADDRINUSE: address already in use :::3000
# 解决方案 1: 终止占用端口的进程
npx kill-port 3000

# 解决方案 2: 使用不同端口
npm run dev -- --port 3001
```

#### 2. 依赖安装失败
```bash
# 清除 npm 缓存
npm cache clean --force

# 删除 node_modules 和重新安装
rm -rf node_modules package-lock.json
npm install
```

#### 3. API 请求失败
- 确保后端服务器在 `http://localhost:3001` 运行
- 检查控制台是否有网络错误
- 验证 API 端点路径是否正确（应以 `/api/` 开头）

#### 4. TypeScript 错误
```bash
# 检查 TypeScript 配置
npx tsc --noEmit

# 如果类型定义缺失
npm install @types/node @types/react @types/react-dom --save-dev
```

### 网络配置

#### 本地网络访问
如需在局域网内访问应用：
```bash
npm run dev -- --host 0.0.0.0
```
然后使用本机 IP 地址访问，如: `http://192.168.1.100:3000`

#### 后端地址修改
如果后端运行在不同端口或服务器，修改 `vite.config.ts`:
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:YOUR_PORT',  // 修改端口
      changeOrigin: true
    }
  }
}
```

## 开发工具推荐

### VS Code 扩展
- **TypeScript**: 内置支持
- **ES7+ React/Redux/React-Native snippets**: 代码片段
- **Prettier**: 代码格式化
- **ESLint**: 代码检查

### 浏览器工具
- **React Developer Tools**: React 组件调试
- **Network Tab**: 监控 API 请求
- **Console**: 查看错误和日志

## 构建和部署

### 生产构建
```bash
npm run build
```

### 预览构建结果
```bash
npm run preview
```

构建输出位于 `dist/` 目录，可以部署到任何静态文件服务器。

## 项目结构
```
client/
├── public/          # 静态资源
├── src/             # 源代码
│   ├── components/  # React 组件
│   ├── pages/       # 页面组件
│   ├── utils/       # 工具函数
│   └── types/       # TypeScript 类型定义
├── package.json     # 项目依赖
├── vite.config.ts   # Vite 配置
└── tsconfig.json    # TypeScript 配置
```

## 技术栈
- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite
- **开发服务器**: Vite Dev Server
- **API 通信**: Fetch API / Axios（根据实际使用）