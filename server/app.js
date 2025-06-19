// const express = require('express');
// const cors = require('cors');
// const session = require('express-session');
// const dotenv = require('dotenv');

// // 🔧 修复：在应用启动时加载环境变量
// dotenv.config();

// const app = express();

// // CORS 配置
// app.use(cors({
//   origin: 'http://localhost:3000', // 前端地址
//   credentials: true
// }));

// // Session 配置
// app.use(session({
//   secret: 'your-secret-key-for-cem-ai-platform', // 更改为安全的密钥
//   resave: false,
//   saveUninitialized: false,
//   cookie: { 
//     secure: false, // 开发环境设为 false，生产环境使用 HTTPS 时设为 true
//     maxAge: 24 * 60 * 60 * 1000 // 24小时
//   }
// }));

// // 解析 JSON 和 URL 编码的请求体
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // 设置响应头确保中文正确显示
// app.use((req, res, next) => {
//   res.setHeader('Content-Type', 'application/json; charset=utf-8');
//   next();
// });

// // 路由配置
// const authRoutes = require('./middleware/auth');
// const uploadRoutes = require('./routes/upload');
// const learningRoutes = require('./routes/learning');
// const quizRoutes = require('./routes/quizRoutes');
// const aiRoutes = require('./routes/ai');
// const tagsRoutes = require('./routes/tags'); // 🔧 新增：标签路由
// const systemRoutes = require('./routes/system'); // 🔄 新增：系统管理路由
// const qaRoutes = require('./routes/qa'); // 🤖 新增：问答路由
// const aiConversationsRoutes = require('./routes/aiConversations'); // 🗨️ 新增：AI对话路由

// console.log('🔧 注册路由...');
// app.use('/api/auth', authRoutes);
// app.use('/api/upload', uploadRoutes);
// app.use('/api/learning', learningRoutes);
// app.use('/api/quiz', quizRoutes);
// app.use('/api/ai', aiRoutes);
// app.use('/api/tags', tagsRoutes); // 🔧 新增：标签路由配置
// app.use('/api/system', systemRoutes); // 🔄 新增：系统管理路由配置
// app.use('/api/qa', qaRoutes); // 🤖 新增：问答路由配置
// app.use('/api/aiConversations', aiConversationsRoutes); // 🗨️ 新增：AI对话路由配置

// // 健康检查路由
// app.get('/api/health', (req, res) => {
//   res.json({ status: 'OK', timestamp: new Date().toISOString() });
// });

// // 错误处理中间件
// app.use((err, req, res, next) => {
//   console.error('服务器错误:', err);
//   res.status(500).json({
//     success: false,
//     message: '服务器内部错误',
//     error: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
//   });
// });

// // 404 处理
// app.use('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: `接口 ${req.originalUrl} 不存在`
//   });
// });

// // 🔧 修复：确保文件数据库只初始化一次
// let isFileDbInitialized = false;

// // 🔧 增强：服务器启动时的文件数据库诊断
// const performStartupDiagnostics = async () => {
//   console.log('\n=== 🔍 服务器启动诊断 ===');
  
//   try {
//     const database = require('./database/database');
    
//     // 🔧 新增：验证数据库表结构
//     console.log('🔧 验证数据库表结构...');
//     try {
//       const fileTableInfo = database.db.prepare("PRAGMA table_info(uploaded_files)").all();
//       const requiredColumns = ['id', 'original_name', 'upload_path', 'file_size', 'file_type', 'status', 'content', 'ai_analysis', 'created_at', 'processed_at', 'last_modified', 'error_message'];
      
//       console.log('📋 uploaded_files表当前字段:');
//       fileTableInfo.forEach(col => {
//         console.log(`   - ${col.name} (${col.type})`);
//       });
      
//       const existingColumns = fileTableInfo.map(col => col.name);
//       const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
      
//       if (missingColumns.length > 0) {
//         console.warn(`⚠️ 缺少字段: ${missingColumns.join(', ')}`);
//         console.log('💡 数据库初始化将自动添加缺失字段');
//       } else {
//         console.log('✅ 数据库表结构完整');
//       }
//     } catch (tableError) {
//       console.error('❌ 验证数据库表结构失败:', tableError);
//     }
    
//     // 1. 检查数据库文件统计
//     const fileStats = database.files.getFileStats();
//     console.log('📊 数据库文件统计:');
//     console.log(`   📁 总文件数: ${fileStats.total}`);
//     console.log(`   ✅ 已完成: ${fileStats.completed}`);
//     console.log(`   🔄 处理中: ${fileStats.processing}`);
//     console.log(`   ❌ 失败: ${fileStats.failed}`);
//     console.log(`   ⏳ 已上传: ${fileStats.uploaded}`);
//     console.log(`   💾 总大小: ${(fileStats.total_size / 1024 / 1024).toFixed(2)} MB`);
    
//     // 2. 检查uploads目录
//     const path = require('path');
//     const fs = require('fs-extra');
//     const uploadsDir = path.join(__dirname, 'uploads');
    
//     if (await fs.pathExists(uploadsDir)) {
//       const files = await fs.readdir(uploadsDir);
//       const physicalFiles = files.filter(f => !f.startsWith('.'));
//       console.log(`📁 uploads目录物理文件: ${physicalFiles.length} 个`);
      
//       if (physicalFiles.length !== fileStats.total) {
//         console.warn(`⚠️ 数据库记录(${fileStats.total})与物理文件(${physicalFiles.length})数量不匹配`);
//       }
//     } else {
//       console.warn('⚠️ uploads目录不存在');
//     }
    
//     // 🔧 新增：修复损坏的AI分析数据
//     console.log('🔧 检查并修复损坏的AI分析数据...');
//     try {
//       const fixResult = database.files.fixCorruptedAIAnalysis();
//       if (fixResult.fixed > 0) {
//         console.log(`🔧 修复了${fixResult.fixed}个损坏的AI分析数据`);
//       } else {
//         console.log('✅ 没有发现损坏的AI分析数据');
//       }
//     } catch (fixError) {
//       console.error('❌ 修复AI分析数据失败:', fixError);
//     }
    
//     // 3. 初始化文件数据库 - 🔧 确保只初始化一次
//     if (!isFileDbInitialized) {
//       console.log('🔄 初始化文件数据库...');
//       const uploadModule = require('./routes/upload');
//       await uploadModule.initializeFileDatabase();
//       isFileDbInitialized = true;
//       console.log('✅ 文件数据库初始化完成');
//     } else {
//       console.log('ℹ️ 文件数据库已初始化，跳过重复初始化');
//     }
    
//     // 🔧 修复：清理所有标签的无效文件关联 - 修复调用方式
//     console.log('🧹 清理所有标签的无效文件关联...');
//     try {
//       const allTags = database.tags.getAllTags();
//       let totalCleaned = 0;
      
//       for (const tag of allTags) {
//         try {
//           // 🔧 修复调用方式
//           const cleanupResult = database.tags.cleanupInvalidFileAssociations(tag.id);
//           if (cleanupResult.cleaned > 0) {
//             totalCleaned += cleanupResult.cleaned;
//             console.log(`🧹 标签"${tag.name}": 清理了${cleanupResult.cleaned}个无效关联`);
//           }
//         } catch (tagCleanupError) {
//           console.warn(`清理标签"${tag.name}"时出错:`, tagCleanupError);
//         }
//       }
      
//       if (totalCleaned > 0) {
//         console.log(`✅ 标签清理完成: 总共清理了${totalCleaned}个无效文件关联`);
//       } else {
//         console.log('✅ 所有标签的文件关联都是有效的');
//       }
//     } catch (cleanupError) {
//       console.error('❌ 标签清理失败:', cleanupError);
//     }
    
//     console.log('✅ 服务器启动诊断完成\n');
    
//   } catch (error) {
//     console.error('❌ 启动诊断失败:', error);
//   }
// };

// // 🔧 修复：定期清理任务 - 修复调用方式
// const setupPeriodicCleanup = () => {
//   // 每小时执行一次标签关联清理
//   setInterval(async () => {
//     try {
//       console.log('🕐 执行定期标签关联清理...');
//       const database = require('./database/database');
//       const allTags = database.tags.getAllTags();
//       let totalCleaned = 0;
      
//       for (const tag of allTags) {
//         try {
//           // 🔧 修复调用方式
//           const cleanupResult = database.tags.cleanupInvalidFileAssociations(tag.id);
//           totalCleaned += cleanupResult.cleaned;
//         } catch (error) {
//           console.warn(`定期清理标签"${tag.name}"时出错:`, error);
//         }
//       }
      
//       if (totalCleaned > 0) {
//         console.log(`🧹 定期清理完成: 清理了${totalCleaned}个无效文件关联`);
//       }
//     } catch (error) {
//       console.error('❌ 定期清理失败:', error);
//     }
//   }, 60 * 60 * 1000); // 每小时执行一次
// };

// // 在服务器启动后执行诊断
// const port = process.env.PORT || 3000;
// const server = app.listen(port, async () => {
//   console.log(`🚀 服务器运行在端口 ${port}`);
  
//   // 🔄 新增：初始化WebSocket服务
//   const webSocketService = require('./utils/websocketService');
//   webSocketService.initialize(server);
  
//   // 执行启动诊断
//   await performStartupDiagnostics();
  
//   // 🔧 启动定期清理任务
//   setupPeriodicCleanup();
  
//   console.log(`🌐 访问地址: http://localhost:${port}`);
//   console.log(`🔌 WebSocket地址: ws://localhost:${port}/ws`);
// });
