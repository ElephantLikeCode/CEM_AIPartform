// 最强力的警告屏蔽 - 彻底禁用所有弃用和PDF警告
process.noDeprecation = true;
process.noProcessWarnings = true;

// 完全清理所有警告监听器
process.removeAllListeners('warning');

// 重写原生警告函数
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, name, code) {
  // 完全屏蔽特定警告
  if (typeof warning === 'string') {
    if (warning.includes('font private use area') ||
        warning.includes('Ran out of space') ||
        warning.includes('DEP0060') ||
        warning.includes('util._extend')) {
      return; // 完全忽略
    }
  }
  
  if (name === 'DeprecationWarning' || name === 'ExperimentalWarning') {
    return; // 忽略所有弃用和实验性警告
  }
  
  // 只输出其他重要警告
  originalEmitWarning.call(this, warning, name, code);
};

// 更精确的警告过滤
process.on('warning', (warning) => {
  // 完全屏蔽所有可能的PDF和弃用警告
  return; // 不输出任何警告
});

// 最强力的console.warn屏蔽
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  
  // 检查并屏蔽所有不需要的警告
  if (typeof message === 'string') {
    // 屏蔽PDF字体相关的所有形式警告
    if (message.includes('font private use area') ||
        message.includes('Ran out of space in font') ||
        message.includes('Warning: Ran out of space') ||
        message.includes('font') ||
        message.includes('private use area')) {
      return; // 完全不输出
    }
    
    // 屏蔽util._extend弃用警告
    if (message.includes('DEP0060') || 
        message.includes('util._extend') ||
        message.includes('Object.assign() instead') ||
        message.includes('DeprecationWarning') ||
        message.includes('ExperimentalWarning')) {
      return; // 完全不输出
    }
  }
  
  // 只输出真正重要的警告
  originalConsoleWarn.apply(console, args);
};

// 屏蔽stderr中的警告输出
const originalStderrWrite = process.stderr.write;
process.stderr.write = function(chunk, encoding, callback) {
  const text = chunk.toString();
  
  // 过滤PDF字体警告
  if (text.includes('font private use area') ||
      text.includes('Ran out of space') ||
      text.includes('DEP0060') ||
      text.includes('util._extend')) {
    // 完全不输出
    if (typeof callback === 'function') callback();
    return true;
  }
  
  // 输出其他内容
  return originalStderrWrite.call(this, chunk, encoding, callback);
};

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 导入路由
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const aiRoutes = require('./routes/ai');
const learningRoutes = require('./routes/learning');
const quizRoutes = require('./routes/quizRoutes');
const tagsRoutes = require('./routes/tags'); // 🏷️ 新增：导入标签路由
const systemRoutes = require('./routes/system'); // 🔍 新增：系统监控路由
const qaRoutes = require('./routes/qa'); // 🤖 新增：导入问答路由
const aiConversationsRoutes = require('./routes/aiConversations'); // 🗨️ 新增：AI对话路由
// 导入中间件
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 配置
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Session 配置
app.use(session({
  secret: 'your-secret-key-for-cem-ai-platform',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 设置响应头确保中文正确显示
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 检查并创建 uploads 目录
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 静态文件服务
app.use('/uploads', express.static(uploadsDir));

// 路由配置（添加角色权限控制）
app.use('/api/auth', authRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);  // 管理员专用路由
app.use('/api/upload', requireAdmin, uploadRoutes);  // 只有管理员可以上传文件
app.use('/api/tags', tagsRoutes);  // 🏷️ 新增：标签路由（读取需要登录，管理需要管理员权限）
app.use('/api/ai', aiRoutes);
app.use('/api/learning', requireAuth, learningRoutes);  // 所有登录用户可以学习
app.use('/api/quiz', requireAuth, quizRoutes);  // 所有登录用户可以测验
app.use('/api/qa', requireAuth, qaRoutes);  // 🤖 新增：所有登录用户可以使用问答
app.use('/api/system', systemRoutes);  // 🔍 新增：系统监控路由
app.use('/api/aiConversations', aiConversationsRoutes); // 🗨️ 新增：AI对话路由配置

// 基础路由
app.get('/', (req, res) => {
  res.json({ 
    message: 'STGC3000 AI Learning Platform API Server',
    version: '2.1.2',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// API 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    services: {
      server: 'running',
      ai_service: 'ready',
      file_upload: 'active'
    },
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: '文件大小超过限制',
      error: '文件大小不能超过50MB'
    });
  }
  
  console.error('服务器错误:', error.message);
  res.status(500).json({ 
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? error.message : '服务器异常'
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.originalUrl
  });
});

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  console.log(`🔄 收到 ${signal} 信号，开始优雅关闭...`);
  
  try {
    console.log('✅ 服务器优雅关闭完成');
    process.exit(0);
  } catch (error) {
    console.error('❌ 优雅关闭过程中出错:', error.message);
    process.exit(1);
  }
};

// 注册信号处理
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// 启动服务器
app.listen(PORT, async () => {
  console.log(`🚀 STGC3000 AI Learning Platform Server v2.1.2`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`📁 File uploads directory: ${uploadsDir}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔇 All PDF font warnings and deprecation warnings are completely filtered`);
  
  // 🔧 新增：初始化文件数据库
  try {
    console.log('🔄 初始化文件数据库...');
    const uploadModule = require('./routes/upload');
    if (uploadModule.initializeFileDatabase) {
      await uploadModule.initializeFileDatabase();
      console.log('✅ 文件数据库初始化完成');
    }
  } catch (error) {
    console.error('❌ 文件数据库初始化失败:', error);
  }
  
  // 检查AI服务状态（增加错误处理）
  try {
    const aiService = require('./utils/aiService');
    
    // 设置超时检查
    const checkPromise = aiService.checkModelAvailability();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI服务检查超时')), 15000)
    );
    
    const aiAvailable = await Promise.race([checkPromise, timeoutPromise]);
    if (aiAvailable instanceof Error) {
      console.error('❌ AI服务检查失败:', aiAvailable.message);
    } else {
      console.log('✅ AI服务检查成功');
    }
  } catch (error) {
    console.log(`❌ AI service check failed: ${error.message}`);
  }
  
  console.log(`✅ Server initialization complete - all warnings completely filtered`);
});


