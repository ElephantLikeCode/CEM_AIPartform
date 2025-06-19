# STGC3000 AI 学习平台 - Windows 用户指南

## 快速开始（Windows 系统）

### 前置要求
1. **Node.js 16+** - [下载地址](https://nodejs.org/zh-cn/)
2. **Windows 10/11** 或 Windows Server

### 🚀 一键安装
双击运行：`install-windows.bat`

### 🎯 一键启动
双击运行：`start-windows.bat`

## 手动安装步骤

### 1. 检查环境
打开命令提示符（cmd）或 PowerShell：
```cmd
node --version
npm --version
```

### 2. 安装后端依赖
```cmd
cd C:\Users\elephant\OneDrive\Desktop\STGC3000\partform\server
npm install
```

### 3. 安装前端依赖  
```cmd
cd C:\Users\elephant\OneDrive\Desktop\STGC3000\partform\client
npm install
```

## 运行项目

### 方法一：使用批处理脚本（推荐）
1. 双击 `start-windows.bat`
2. 选择 "3. 同时启动前后端"
3. 等待服务启动完成
4. 在浏览器中访问 `http://localhost:3000`

### 方法二：手动启动

#### 启动后端
```cmd
cd C:\Users\elephant\OneDrive\Desktop\STGC3000\partform\server
npm start
```

#### 启动前端（新命令窗口）
```cmd
cd C:\Users\elephant\OneDrive\Desktop\STGC3000\partform\client
npm run dev
```

## Windows 特有问题解决

### 1. 编码问题
如果看到乱码，在命令提示符中运行：
```cmd
chcp 65001
```

### 2. 权限问题
如果遇到权限错误，以管理员身份运行命令提示符。

### 3. 路径问题
确保路径中没有中文字符或空格，如有必要请移动项目到简单路径如：
```
C:\stgc3000\
```

### 4. 端口被占用
```cmd
# 查看端口占用
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# 终止进程
taskkill /PID <进程ID> /F
```

### 5. 防火墙设置
确保 Windows 防火墙允许 Node.js 访问网络。

## 开发工具推荐（Windows）

### 代码编辑器
- **VS Code** - [下载地址](https://code.visualstudio.com/)
- **WebStorm** - JetBrains IDE

### 终端工具
- **Windows Terminal** - Microsoft Store 下载
- **PowerShell** - 内置
- **Git Bash** - 随 Git 安装

### 浏览器开发工具
- **Chrome DevTools**
- **Edge DevTools**
- **Firefox Developer Tools**

## 项目目录结构
```
C:\Users\elephant\OneDrive\Desktop\STGC3000\partform\
├── server\                    # 后端项目
│   ├── index.js              # 服务器入口
│   ├── routes\               # API 路由
│   ├── models\               # 数据模型
│   ├── uploads\              # 文件上传目录
│   └── package.json          # 后端依赖
├── client\                   # 前端项目
│   ├── src\                  # 源代码
│   ├── public\               # 静态资源
│   └── package.json          # 前端依赖
├── install-windows.bat       # Windows 安装脚本
├── start-windows.bat         # Windows 启动脚本
└── README-WINDOWS.md         # Windows 用户指南
```

## 故障排除

### 常见错误及解决方案

#### "不是内部或外部命令"
```cmd
# 重新安装 Node.js 并确保添加到 PATH
# 或手动添加 Node.js 到系统环境变量
```

#### "访问被拒绝"
```cmd
# 以管理员身份运行命令提示符
# 右键点击 cmd -> "以管理员身份运行"
```

#### "端口已被使用"
```cmd
# 查找并终止占用端口的进程
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

#### "模块未找到"
```cmd
# 重新安装依赖
cd server
rmdir /s node_modules
del package-lock.json
npm install
```

## 性能优化建议

1. **SSD 硬盘** - 提高文件读写速度
2. **关闭不必要软件** - 释放内存和 CPU
3. **配置杀毒软件白名单** - 避免误杀 Node.js 进程
4. **使用有线网络** - 确保网络稳定

## 获取帮助

如果遇到问题，请检查：
1. Node.js 版本是否正确
2. 依赖是否完全安装
3. 防火墙和杀毒软件设置
4. 系统权限设置

技术支持：[项目 GitHub 页面]