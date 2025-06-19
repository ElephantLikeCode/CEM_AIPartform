# STGC3000 Part Form - 后端 API 服务器

## 快速启动

### 1. 安装依赖
```bash
# 安装所有依赖
npm install

# 如果 package.json 中没有依赖，手动安装
npm install express cors

# 安装开发依赖
npm install --save-dev nodemon
```

### 2. 启动服务器
```bash
# 首次运行：安装 nodemon（开发依赖）
npm install --save-dev nodemon

# 首先检查入口文件
ls *.js  # 查看可用的 JS 文件

# 根据实际文件启动（选择其中一种）
npm start              # 默认启动 server.js
npm run start:index    # 启动 index.js
npm run start:app      # 启动 app.js

# 开发模式
npm run dev            # 默认启动 server.js (nodemon)
npm run dev:index      # 启动 index.js (nodemon)
npm run dev:app        # 启动 app.js (nodemon)

# 如果以上都不工作，手动指定文件
node server.js
node index.js
node app.js
```

### 3. 验证服务器
服务器将在 `http://localhost:3001` 启动

## 故障排除

### Express 模块未找到
```bash
# 解决方案 1: 安装 Express 和相关依赖
npm install express cors

# 解决方案 2: 重新安装所有依赖
npm install

# 解决方案 3: 检查 package.json 中的依赖
cat package.json
```

### nodemon 命令未找到
```bash
# 解决方案 1: 安装 nodemon
npm install --save-dev nodemon

# 解决方案 2: 全局安装 nodemon
npm install -g nodemon

# 解决方案 3: 使用简单启动模式
npm run dev-simple
```

### 入口文件不存在
```bash
# 检查目录中的文件
dir *.js
# 或
ls *.js

# 常见的入口文件名
node server.js
node index.js
node app.js
node main.js

# 如果没有 JS 文件，可能需要先构建
npm run build  # 如果有构建脚本
```

## 可用脚本
```bash
npm start              # 生产模式 (server.js)
npm run start:index    # 生产模式 (index.js)
npm run start:app      # 生产模式 (app.js)
npm run dev            # 开发模式 (server.js + nodemon)
npm run dev:index      # 开发模式 (index.js + nodemon)
npm run dev:app        # 开发模式 (app.js + nodemon)
npm run test           # 运行测试
```

## API 端点
- 基础 URL: `http://localhost:3001/api`
- 示例: `GET http://localhost:3001/api/parts`

## 环境配置
- 默认端口: 3001
- 数据库: [根据实际配置填写]
- 环境变量: 查看 `.env` 文件（如果存在）

## 依赖说明
- **express**: Web 框架
- **cors**: 跨域资源共享中间件
- **nodemon**: 开发时自动重启服务器（开发依赖）
