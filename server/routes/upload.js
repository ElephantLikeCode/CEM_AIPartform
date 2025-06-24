const express = require('express');
const multer = require('multer');      // 📤 文件上传处理
const path = require('path');
const fs = require('fs-extra');        // 📁 文件系统操作
const router = express.Router();
const aiService = require('../utils/aiService');
const database = require('../database/database'); // 🏷️ 新增：数据库操作
const ragService = require('../utils/ragService'); // 🔧 新增：RAG服务
const { requireAuth, requireAdmin } = require('../middleware/auth'); // 🔒 新增：权限验证
const webSocketService = require('../utils/websocketServiceStub'); // 🔄 临时：WebSocket桩服务

// 🔧 新增：生成唯一ID的函数
const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `file_${timestamp}_${randomStr}`;
};

// 🔧 新增：生成相对时间显示
const getRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
};

// 🔧 新增：文件大小格式化函数
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 配置文件存储 - multer使用
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    fs.ensureDirSync(uploadDir);       // 📁 fs-extra确保目录存在
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 🔧 修复：使用原始文件名而不是随机文件名
    const originalFileName = normalizeFileName(file.originalname);
    
    // 检查文件是否已存在，如果存在则添加时间戳
    const uploadDir = path.join(__dirname, '../uploads');
    const basePath = path.join(uploadDir, originalFileName);
    
    if (fs.existsSync(basePath)) {
      const timestamp = Date.now();
      const ext = path.extname(originalFileName);
      const nameWithoutExt = path.basename(originalFileName, ext);
      const uniqueFileName = `${nameWithoutExt}_${timestamp}${ext}`;
      // File exists, using unique name
      cb(null, uniqueFileName);
    } else {
      // Using original filename
      cb(null, originalFileName);
    }
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.ppt', '.pptx', '.pdf', '.doc', '.docx', '.txt', '.md'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${ext}. 支持的格式: ${allowedTypes.join(', ')}`), false);
  }
};

const upload = multer({               // 📤 multer配置
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// 模拟文件数据库 - 删除默认示例文件
let fileDatabase = [];

// 🔧 新增：文件引用计数管理（用于多用户并发隔离）
let fileReferences = new Map(); // Map<fileId, { count: number, users: Set<userId> }>

// 🔧 新增：文件锁定管理（防止并发编辑冲突）
let fileLocks = new Map(); // Map<fileId, { userId: string, lockedAt: timestamp, sessionId: string }>

// 🔧 修改：在服务器启动时从数据库加载文件数据 - 修复 JSON 解析错误
const initializeFileDatabase = async () => {
  try {
    // File recovery process started
    
    // 🔧 重要：清空内存数据库，避免重复初始化
    fileDatabase.length = 0;
    
    // 1. 从数据库获取所有文件记录
    const savedFiles = database.files.getAllFiles();
    // Database file records retrieved
    
    // 2. 扫描uploads目录中的所有文件
    const uploadsDir = path.join(__dirname, '../uploads');
    let physicalFiles = [];
    
    try {
      if (await fs.pathExists(uploadsDir)) {
        const files = await fs.readdir(uploadsDir);
        physicalFiles = await Promise.all(
          files.map(async (fileName) => {
            const filePath = path.join(uploadsDir, fileName);
            try {
              const stats = await fs.stat(filePath);
              if (stats.isFile()) {
                return {
                  fileName,
                  filePath,
                  size: stats.size,
                  createdTime: stats.birthtime,
                  modifiedTime: stats.mtime
                };
              }
            } catch (error) {
              console.warn(`检查文件失败: ${fileName}`, error);
            }
            return null;
          })
        );
        physicalFiles = physicalFiles.filter(Boolean);
        // Physical files found in uploads directory
      }
    } catch (error) {
      console.warn('扫描uploads目录失败:', error);
    }
    
    // 3. 恢复有效的文件记录 - 🔧 确保唯一性
    const validFiles = [];
    const processedFileIds = new Set(); // 🔧 用于跟踪已处理的文件ID
    const orphanedDbRecords = [];
    const orphanedPhysicalFiles = [];
    
    // 处理数据库记录
    for (const dbFile of savedFiles) {
      try {
        // 🔧 检查文件ID是否已处理，避免重复
        if (processedFileIds.has(dbFile.id)) {
          console.warn(`⚠️ 检测到重复的文件ID: ${dbFile.id}，跳过处理`);
          continue;
        }
        
        // 检查物理文件是否存在
        const fileExists = await fs.pathExists(dbFile.uploadPath);
        
        if (fileExists) {
          // 为文件加载标签信息
          const tags = database.tags.getFileTags(dbFile.id);
          
          // 🔧 安全解析 AI 分析数据
          let aiAnalysis = null;
          try {
            if (dbFile.aiAnalysis) {
              if (typeof dbFile.aiAnalysis === 'object') {
                aiAnalysis = dbFile.aiAnalysis;
              } else if (typeof dbFile.aiAnalysis === 'string') {
                try {
                  aiAnalysis = JSON.parse(dbFile.aiAnalysis);
                } catch (parseError) {
                  console.warn(`⚠️ 文件 ${dbFile.originalName} 的AI分析数据解析失败:`, parseError.message);
                  aiAnalysis = null;
                }
              }
            }
          } catch (analysisError) {
            console.warn(`处理文件 ${dbFile.originalName} 的AI分析数据时出错:`, analysisError.message);
            aiAnalysis = null;
          }
          
          // 补充可能缺失的字段
          const restoredFile = {
            ...dbFile,
            tags: tags || [],
            aiAnalysis: aiAnalysis,
            hasAIResults: !!(aiAnalysis && aiAnalysis.learningStages),
            stages: aiAnalysis?.learningStages?.length || 0,
            keyPoints: aiAnalysis?.keyPoints?.length || 0,
            aiSummary: aiAnalysis?.summary,
            learningReady: dbFile.status === 'completed' && !!dbFile.content && !!aiAnalysis,
            relativeTime: getRelativeTime(dbFile.uploadTimestamp || new Date(dbFile.createdAt).getTime())
          };
          
          validFiles.push(restoredFile);
          processedFileIds.add(dbFile.id); // 🔧 标记为已处理
          // File recovered with AI analysis
        } else {
          orphanedDbRecords.push(dbFile);
          console.warn(`⚠️ 数据库记录对应的物理文件不存在: ${dbFile.originalName}`);
        }
      } catch (error) {
        console.error(`检查文件 ${dbFile.originalName} 失败:`, error);
        orphanedDbRecords.push(dbFile);
      }
    }
    
    // 4. 查找孤立的物理文件 - 🔧 改进逻辑
    for (const physicalFile of physicalFiles) {
      // 🔧 精确匹配物理文件和数据库记录
      const dbRecord = savedFiles.find(dbFile => {
        // 检查完整路径匹配
        if (dbFile.uploadPath === physicalFile.filePath) {
          return true;
        }
        // 检查文件名匹配（兼容旧版本）
        const dbFileName = path.basename(dbFile.uploadPath);
        return dbFileName === physicalFile.fileName;
      });
      
      if (!dbRecord) {
        orphanedPhysicalFiles.push(physicalFile);
        console.warn(`⚠️ 发现孤立的物理文件: ${physicalFile.fileName}`);
      }
    }
    
    // 5. 清理孤立的数据库记录
    if (orphanedDbRecords.length > 0) {
      // Cleaning orphaned database records
      for (const orphanedRecord of orphanedDbRecords) {
        try {
          database.tags.removeAllFileTags(orphanedRecord.id);
          database.files.deleteFile(orphanedRecord.id);
          // Orphaned record cleaned
        } catch (error) {
          console.error(`清理孤立记录失败: ${orphanedRecord.originalName}`, error);
        }
      }
    }
    
    // 6. 处理孤立的物理文件 - 🔧 改进创建逻辑
    if (orphanedPhysicalFiles.length > 0) {
      // Orphaned physical files detected
      
      for (const orphanedFile of orphanedPhysicalFiles) {
        try {
          // 🔧 改进：基于文件扩展名和大小判断是否为有效文件
          const fileExt = path.extname(orphanedFile.fileName).toLowerCase();
          const validExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.ppt', '.pptx'];
          
          if (validExtensions.includes(fileExt) && orphanedFile.size > 100) {
            // 🔧 使用原始文件名而不是解析后的名称
            const originalName = orphanedFile.fileName;
            
            // 🔧 生成唯一ID，确保不会与现有记录冲突
            let newFileId;
            do {
              newFileId = generateUniqueId();
            } while (processedFileIds.has(newFileId));
            
            const restoredFile = {
              id: newFileId,
              originalName: originalName,
              uploadPath: orphanedFile.filePath,
              fileSize: orphanedFile.size,
              fileType: fileExt,
              status: 'uploaded', // 需要重新分析
              createdAt: orphanedFile.createdTime.getTime(),
              uploadTime: orphanedFile.createdTime.toISOString(),
              uploadTimestamp: orphanedFile.createdTime.getTime(),
              relativeTime: getRelativeTime(orphanedFile.createdTime.getTime()),
              hasAIResults: false,
              content: null,
              aiAnalysis: null,
              stages: 0,
              keyPoints: 0,
              tags: []
            };
            
            // 保存到数据库
            database.files.saveFile(restoredFile);
            validFiles.push(restoredFile);
            processedFileIds.add(newFileId); // 🔧 标记为已处理
            
            // Orphaned file recovered
            
            // 异步重新分析该文件
            setTimeout(() => {
              processFileWithAI(restoredFile, 'local'); // 🤖 传递默认模型
            }, 1000);
          }
        } catch (error) {
          console.error(`处理孤立文件失败: ${orphanedFile.fileName}`, error);
        }
      }
    }
    
    // 7. 更新内存数据库 - 🔧 确保完全替换
    fileDatabase.splice(0, fileDatabase.length, ...validFiles);
      // File database initialization completed
    
    // 8. 输出恢复的文件列表
    if (validFiles.length > 0) {      // List of recovered files (debug mode)
    }
    
  } catch (error) {
    console.error('❌ 初始化文件数据库失败:', error);
  }
};

// 改进的文件名编码处理函数
const normalizeFileName = (fileName) => {
  try {
    // 如果文件名已经是正确的UTF-8格式，直接返回
    if (!/[\u00C0-\u024F\u1E00-\u1EFF]/.test(fileName) && /[\u4e00-\u9fa5]/.test(fileName)) {
      return fileName;
    }
    
    // 尝试不同的解码方式
    const decodingMethods = [
      // 方法1: 直接使用原文件名
      () => fileName,
      
      // 方法2: URL解码
      () => decodeURIComponent(fileName),
      
      // 方法3: Buffer转换 (latin1 -> utf8)
      () => Buffer.from(fileName, 'latin1').toString('utf8'),
      
      // 方法4: Buffer转换 (binary -> utf8)  
      () => Buffer.from(fileName, 'binary').toString('utf8'),
      
      // 方法5: 处理双重编码
      () => {
        let decoded = fileName;
        try {
          decoded = decodeURIComponent(fileName);
          decoded = decodeURIComponent(decoded);
        } catch (e) {
          // 如果解码失败，尝试Buffer方式
          decoded = Buffer.from(fileName, 'latin1').toString('utf8');
        }
        return decoded;
      }
    ];
    
    // 测试每种方法，选择最佳结果
    for (const method of decodingMethods) {
      try {
        const result = method();
        
        // 检查结果是否包含中文字符且没有乱码
        if (result && 
            /[\u4e00-\u9fa5]/.test(result) && 
            !result.includes('\uFFFD') && 
            !result.includes('ï¿½') &&
            result.length > 0) {
          // Filename decode successful
          return result;
        }
      } catch (error) {
        continue;
      }
    }
    
    // 如果所有方法都失败，返回原文件名
    // Filename decode failed, using original
    return fileName;
    
  } catch (error) {
    console.error('文件名处理错误:', error);
    return fileName;
  }
};

// 安全编码文件名用于存储
const safeEncodeFileName = (fileName) => {
  try {
    // 直接存储UTF-8格式，不进行额外编码
    return fileName;
  } catch (error) {
    return fileName;
  }
};

// 🔧 新增：通知标签统计更新的函数
const notifyTagStatsUpdate = (fileId) => {
  try {
    // 获取文件的所有标签
    const fileTags = database.tags.getFileTags(fileId);
    
    // 通知每个标签更新统计
    fileTags.forEach(tag => {
      // Tag notification sent
      // 可以在这里添加实时通知逻辑，比如 WebSocket 推送
    });
    
    // Tag statistics notifications sent
    return fileTags;
  } catch (error) {
    console.error('通知标签统计更新失败:', error);
    return [];
  }
};

// 文件上传处理 - 修改为支持持久化
router.post('/files', requireAuth, upload.single('file'), async (req, res) => {
  try {
    // File upload request received
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '没有上传文件'
      });
    }

    // 🔧 改进：使用实际保存的文件名
    const rawFileName = req.file.originalname;
    const normalizedFileName = normalizeFileName(rawFileName);
    const actualFileName = req.file.filename; // multer保存的实际文件名
    
    console.log('📁 文件名处理信息:', {
      原始文件名: rawFileName,
      规范化文件名: normalizedFileName,
      实际保存文件名: actualFileName,
      保存路径: req.file.path
    });    // 🔧 检查文件是否已存在于数据库中 - 改进重复检测逻辑
    const { overwrite = false } = req.body; // 允许覆盖参数
    const existingFiles = database.files.getAllFiles();
    const duplicateFile = existingFiles.find(f => 
      f.originalName === normalizedFileName || 
      path.basename(f.uploadPath) === actualFileName
    );
    
    if (duplicateFile && !overwrite) {
      console.warn(`⚠️ 检测到重复文件: ${normalizedFileName}`);
      
      // 删除刚上传的物理文件
      await fs.remove(req.file.path);
      
      return res.status(409).json({
        success: false,
        message: `文件"${normalizedFileName}"已存在`,
        duplicateFileId: duplicateFile.id,
        suggestion: '如需覆盖，请在上传时设置 overwrite=true 参数'
      });
    }
    
    // 如果选择覆盖，删除旧文件
    if (duplicateFile && overwrite) {
      console.log(`🔄 覆盖现有文件: ${normalizedFileName}`);
      
      // 删除旧的物理文件
      try {
        if (await fs.pathExists(duplicateFile.uploadPath)) {
          await fs.remove(duplicateFile.uploadPath);
          console.log('🗑️ 旧物理文件已删除');
        }
      } catch (error) {
        console.warn('删除旧物理文件失败:', error);
      }
      
      // 从数据库删除旧记录
      try {
        database.files.deleteFile(duplicateFile.id);
        console.log('💾 旧文件记录已从数据库删除');
      } catch (error) {
        console.warn('删除旧文件记录失败:', error);
      }
      
      // 从内存数据库删除
      const oldIndex = fileDatabase.findIndex(f => f.id === duplicateFile.id);
      if (oldIndex !== -1) {
        fileDatabase.splice(oldIndex, 1);
      }
    }

    // 创建文件记录 - 🔧 使用实际文件名作为显示名称
    const newFile = {
      id: generateUniqueId(),
      originalName: normalizedFileName, // 用户看到的名称
      uploadPath: req.file.path, // 实际存储路径
      fileSize: req.file.size,
      fileType: path.extname(rawFileName),
      status: 'uploaded',
      createdAt: Date.now(),
      uploadTime: new Date().toISOString(),
      uploadTimestamp: Date.now(),
      relativeTime: getRelativeTime(Date.now()),
      hasAIResults: false,
      content: null,
      aiAnalysis: null,
      stages: 0,
      keyPoints: 0,
      tags: []
    };
    
    // 🔧 立即保存到数据库
    try {
      database.files.saveFile(newFile);
      console.log('💾 ✅ 文件记录已立即保存到数据库');
    } catch (dbError) {
      console.error('❌ 立即保存文件记录到数据库失败:', dbError);
      await fs.remove(req.file.path);
      return res.status(500).json({
        success: false,
        message: '文件记录保存失败，上传中止',
        error: dbError.message
      });
    }
    
    // 添加到内存数据库
    fileDatabase.push(newFile);
    console.log('✅ 文件保存成功:', normalizedFileName);

    // 立即开始AI处理（异步）
    setImmediate(() => {
      processFileWithAI(newFile, 'local'); // 🤖 上传时默认使用本地模型
    });
    
    res.json({
      success: true,
      message: `文件"${normalizedFileName}"上传成功，AI分析开始...`,
      data: {
        id: newFile.id,
        originalName: normalizedFileName,
        actualFileName: actualFileName,
        status: newFile.status,
        fileSize: formatFileSize(newFile.fileSize)
      }
    });
    
  } catch (error) {
    console.error('❌ 文件上传错误:', error);
    
    if (req.file && req.file.path) {
      try {
        await fs.remove(req.file.path);
        console.log('🧹 已清理失败上传的物理文件');
      } catch (cleanupError) {
        console.error('清理物理文件失败:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: '文件上传失败',
      message: error.message
    });
  }
});

// AI处理文件函数 - 🔧 移除难度和时间估算逻辑
async function processFileWithAI(fileData, selectedModel = 'local') {
  try {
    console.log(`🤖 开始深度AI处理文件: ${fileData.originalName}，使用模型: ${selectedModel}`);
    
    // 更新状态为处理中
    fileData.status = 'processing';
    
    // 🔧 立即同步状态到数据库
    try {
      database.files.updateFile(fileData.id, { 
        status: 'processing',
        processedAt: new Date().toISOString()
      });
      console.log('💾 处理状态已同步到数据库');
    } catch (dbError) {
      console.warn('⚠️ 同步处理状态到数据库失败:', dbError);
    }
    
    // 验证物理文件是否存在
    if (!await fs.pathExists(fileData.uploadPath)) {
      throw new Error(`物理文件不存在: ${fileData.uploadPath}`);
    }
    
    // 提取文件内容
    console.log(`📄 开始提取文件内容: ${fileData.fileType}`);
    const content = await aiService.extractFileContent(
      fileData.uploadPath, 
      fileData.fileType.substring(1)
    );
    
    console.log(`📄 文件内容提取完成: ${content.length} 字符`);
    
    // 🔧 立即保存内容到数据库
    fileData.content = content;
    try {
      database.files.updateFile(fileData.id, { 
        content: content
      });
      console.log('💾 文件内容已同步到数据库');
    } catch (dbError) {
      console.warn('⚠️ 保存文件内容到数据库失败:', dbError);
    }
      // AI分析内容
    console.log(`🤖 开始深度AI内容分析，使用模型: ${selectedModel}...`);
    const analysis = await aiService.analyzeContent(content, fileData.originalName, selectedModel);
    
    console.log('🎯 AI分析完成');
    
    // 更新文件数据 - 🔧 移除难度和时间相关字段
    fileData.aiAnalysis = analysis;
    fileData.status = 'completed';
    fileData.processedAt = new Date().toISOString();
    fileData.hasAIResults = !!(analysis && analysis.learningStages);
    fileData.stages = analysis?.learningStages?.length || 0;
    fileData.keyPoints = analysis?.keyPoints?.length || 0;
    fileData.aiSummary = analysis?.summary;

    // 🔧 新增：生成RAG向量索引
    try {
      await ragService.indexDocument(fileData.id, fileData.originalName, fileData.content);
      console.log(`📚 文件 ${fileData.originalName} RAG索引生成完成`);
    } catch (ragError) {
      console.warn(`⚠️ 文件 ${fileData.originalName} RAG索引生成失败:`, ragError);
      // RAG索引失败不影响主流程
    }
    
    // 🔧 重要：立即完整同步到数据库
    try {
      database.files.updateFile(fileData.id, {
        status: 'completed',
        aiAnalysis: fileData.aiAnalysis,
        processedAt: fileData.processedAt
      });
      
      console.log('💾 ✅ AI分析结果已完整同步到数据库');
    } catch (dbError) {
      console.error('❌ 同步AI分析结果到数据库失败:', dbError);
    }
    
    console.log(`✅ AI处理完成: ${fileData.originalName}`);
    
  } catch (error) {
    console.error('❌ AI处理失败:', error);
    
    fileData.status = 'failed';
    fileData.error = error.message;
    fileData.processedAt = new Date().toISOString();
    
    // 🔧 同步错误状态到数据库
    try {
      database.files.updateFile(fileData.id, {
        status: 'failed',
        error: error.message,
        processedAt: fileData.processedAt
      });
      console.log('💾 错误状态已同步到数据库');
    } catch (dbError) {
      console.error('❌ 保存错误状态到数据库失败:', dbError);
    }
  }
}

// 🔧 新增：重新处理文件
router.post('/files/:id/reprocess', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { model } = req.body; // 🤖 新增：获取模型参数
    const selectedModel = model || 'local'; // 默认使用本地模型
    
    console.log(`🔄 收到文件重新处理请求: ${fileId}, 使用模型: ${selectedModel}`);
    
    // 查找文件
    const fileIndex = fileDatabase.findIndex(f => f.id === fileId);
    if (fileIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    const file = fileDatabase[fileIndex];
      // 检查文件状态 - 🔧 修复：允许所有文件重新分析，不仅仅是失败的文件
    if (file.status === 'processing') {
      return res.status(400).json({
        success: false,
        message: '文件正在处理中，请稍后重试'
      });
    }
    
    // 验证物理文件是否存在
    if (!await fs.pathExists(file.uploadPath)) {
      console.error(`❌ 物理文件不存在: ${file.uploadPath}`);
      return res.status(400).json({
        success: false,
        message: '源文件不存在，无法重新处理'
      });
    }
      console.log(`🔄 开始重新处理文件: ${file.originalName} (当前状态: ${file.status})`);
    
    // 重置文件状态
    file.status = 'uploaded';
    file.error = null;
    file.processedAt = null;
    file.content = null;
    file.aiAnalysis = null;
    file.hasAIResults = false;
    file.stages = 0;
    file.keyPoints = 0;
    file.aiSummary = null;
    
    // 🔧 立即同步状态到数据库
    try {
      database.files.updateFile(fileId, { 
        status: 'uploaded',
        error: null,
        processedAt: null,
        content: null,
        aiAnalysis: null
      });
      console.log('💾 文件重置状态已同步到数据库');
    } catch (dbError) {
      console.warn('⚠️ 同步重置状态到数据库失败:', dbError);
    }    // 立即开始重新处理（异步）
    setImmediate(() => {
      processFileWithAI(file, selectedModel); // 🤖 修改：传递正确的模型参数
    });
    
    console.log(`✅ 文件 ${file.originalName} 重新处理已开始`);
      res.json({
      success: true,
      message: `文件"${file.originalName}"重新分析已开始`,
      data: {
        id: file.id,
        originalName: file.originalName,
        status: file.status,
        message: 'AI重新分析进行中...'
      }
    });
    
  } catch (error) {
    console.error('❌ 重新处理文件失败:', error);
    res.status(500).json({
      success: false,
      message: '重新处理文件失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：为文件添加标签 - 修复为立即更新统计
router.post('/files/:id/tags', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { tagIds } = req.body;

    console.log('🏷️ 为文件添加标签:', { fileId, tagIds });

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '标签ID数组不能为空'
      });
    }

    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    // 验证标签是否存在
    const validTags = [];
    for (const tagId of tagIds) {
      try {
        const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
        if (tag) {
          validTags.push(tag);
          // 添加文件-标签关联
          database.tags.addFileTag(fileId, tagId);
        } else {
          console.warn(`标签 ${tagId} 不存在`);
        }
      } catch (error) {
        console.error(`添加标签 ${tagId} 失败:`, error);
      }
    }

    // 更新内存中的文件标签信息
    file.tags = validTags;

    // 🔔 立即通知所有相关标签更新统计
    const notifiedTags = notifyTagStatsUpdate(fileId);

    console.log(`✅ 为文件 ${file.originalName} 添加了 ${validTags.length} 个标签，通知 ${notifiedTags.length} 个标签更新统计`);

    res.json({
      success: true,
      message: `成功为文件添加 ${validTags.length} 个标签`,
      data: {
        fileId: fileId,
        fileName: file.originalName,
        tags: validTags,
        notifiedTags: notifiedTags.length
      }
    });

  } catch (error) {
    console.error('添加文件标签失败:', error);
    res.status(500).json({
      success: false,
      message: '添加文件标签失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：移除文件标签 - 修复为立即更新统计
router.delete('/files/:id/tags/:tagId', requireAuth, async (req, res) => {
  try {
    const { id: fileId, tagId } = req.params;

    console.log('🏷️ 移除文件标签:', { fileId, tagId });

    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    // 从数据库中移除关联
    const result = database.tags.removeFileTag(fileId, parseInt(tagId));
    
    if (result.changes > 0) {
      // 更新内存中的文件标签信息
      file.tags = file.tags.filter(tag => tag.id !== parseInt(tagId));
      
      // 🔔 立即通知标签统计更新
      const notifiedTags = notifyTagStatsUpdate(fileId);
      
      console.log(`✅ 已移除文件 ${file.originalName} 的标签 ${tagId}，通知 ${notifiedTags.length} 个标签更新统计`);
      
      res.json({
        success: true,
        message: '标签移除成功',
        data: {
          fileId: fileId,
          fileName: file.originalName,
          remainingTags: file.tags,
          notifiedTags: notifiedTags.length
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: '文件标签关联不存在'
      });
    }

  } catch (error) {
    console.error('移除文件标签失败:', error);
    res.status(500).json({
      success: false,
      message: '移除文件标签失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：获取文件的所有标签
router.get('/files/:id/tags', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;

    console.log('🏷️ 获取文件标签:', fileId);

    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    // 从数据库获取文件的所有标签
    const fileTags = database.tags.getFileTags(fileId);
    
    console.log(`✅ 文件 ${file.originalName} 有 ${fileTags.length} 个标签`);

    res.json({
      success: true,
      data: {
        fileId: fileId,
        fileName: file.originalName,
        tags: fileTags
      }
    });

  } catch (error) {
    console.error('获取文件标签失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文件标签失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：批量为文件设置标签（替换现有标签）
router.put('/files/:id/tags', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { tagIds } = req.body;

    console.log('🏷️ 批量设置文件标签:', { fileId, tagIds });

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({
        success: false,
        message: '标签ID必须是数组格式'
      });
    }

    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }

    // 先移除文件的所有现有标签
    const existingTags = database.tags.getFileTags(fileId);
    for (const tag of existingTags) {
      database.tags.removeFileTag(fileId, tag.id);
    }

    // 添加新的标签
    const validTags = [];
    for (const tagId of tagIds) {
      try {
        const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
        if (tag) {
          validTags.push(tag);
          database.tags.addFileTag(fileId, tagId);
        } else {
          console.warn(`标签 ${tagId} 不存在`);
        }
      } catch (error) {
        console.error(`设置标签 ${tagId} 失败:`, error);
      }
    }

    // 更新内存中的文件标签信息
    file.tags = validTags;

    // 🔔 立即通知所有相关标签更新统计
    const notifiedTags = notifyTagStatsUpdate(fileId);

    console.log(`✅ 文件 ${file.originalName} 标签已更新: ${validTags.length} 个标签，通知 ${notifiedTags.length} 个标签更新统计`);

    res.json({
      success: true,
      message: `文件标签设置成功，共 ${validTags.length} 个标签`,
      data: {
        fileId: fileId,
        fileName: file.originalName,
        tags: validTags,
        notifiedTags: notifiedTags.length
      }
    });

  } catch (error) {
    console.error('批量设置文件标签失败:', error);
    res.status(500).json({
      success: false,
      message: '批量设置文件标签失败',
      error: error.message
    });
  }
});

// 删除文件 - 🔧 增强标签关联清理和同步
router.delete('/files/:id', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const fileIndex = fileDatabase.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '文件未找到'
      });
    }
    
    const file = fileDatabase[fileIndex];

    console.log(`🗑️ 开始删除文件: ${file.originalName} (ID: ${fileId})`);

    // 🏷️ 获取并清理文件的所有标签关联
    let affectedTagNames = [];
    try {
      const existingTags = database.tags.getFileTags(fileId);
      console.log(`📋 文件关联了${existingTags.length}个标签`);
      
      for (const tag of existingTags) {
        try {
          // 删除文件-标签关联
          const removeResult = database.tags.removeFileTag(fileId, tag.id);
          if (removeResult.changes > 0) {
            affectedTagNames.push(tag.name);
            console.log(`✅ 已清理标签"${tag.name}"的文件关联`);
            
            // 🔧 检查标签是否还有其他有效文件
            const remainingFiles = database.tags.getTagFiles(tag.id);
            if (remainingFiles.length === 0) {
              console.log(`ℹ️ 标签"${tag.name}"已没有关联文件`);
            } else {
              console.log(`ℹ️ 标签"${tag.name}"还有${remainingFiles.length}个关联文件`);
            }
          }
        } catch (tagError) {
          console.warn(`清理标签"${tag.name}"关联失败:`, tagError);
        }
      }
      
      if (affectedTagNames.length > 0) {
        console.log(`🔔 文件删除影响了${affectedTagNames.length}个标签: ${affectedTagNames.join(', ')}`);
      }
    } catch (error) {
      console.warn('清理文件标签关联失败:', error);
    }
    
    // 🔧 从数据库删除文件记录
    try {
      const dbDeleteResult = database.files.deleteFile(fileId);
      if (dbDeleteResult.changes > 0) {
        console.log('💾 文件记录已从数据库删除');
      }
    } catch (dbError) {
      console.error('❌ 从数据库删除文件记录失败:', dbError);
    }
    
    // 删除物理文件
    try {
      const filePath = file.uploadPath || file.path;
      if (filePath && fs.existsSync(filePath)) {
        await fs.remove(filePath);
        console.log(`🗑️ 物理文件已删除: ${filePath}`);
      } else {
        console.log(`ℹ️ 物理文件不存在或路径无效: ${filePath}`);
      }
    } catch (error) {
      console.error('删除物理文件失败:', error);
    }

    // 🔧 新增：删除RAG索引
    try {
      await ragService.deleteDocumentIndex(fileId);
      console.log(`🗑️ 文件 ${fileId} RAG索引已删除`);
    } catch (ragError) {
      console.warn(`⚠️ 删除文件 ${fileId} RAG索引失败:`, ragError);
    }
    
    // 从内存数据库中删除
    fileDatabase.splice(fileIndex, 1);
    
    console.log(`✅ 文件删除完成: ${file.originalName}`);
    
    res.json({
      success: true,
      message: '文件删除成功',
      data: {
        id: fileId,
        name: file.originalName,
        affectedTags: affectedTagNames,
        affectedTagCount: affectedTagNames.length
      }
    });
  } catch (error) {
    console.error('删除文件失败:', error);
    res.status(500).json({
      success: false,
      message: '删除文件失败',
      error: error.message
    });
  }
});

// 获取文件列表 - 🔧 修复为支持过滤和分页
router.get('/files', requireAuth, async (req, res) => {
  try {
    // 获取查询参数
    const { 
      status, 
      hasAI, 
      tagId, 
      search, 
      page = 1, 
      limit = 50,
      sortBy = 'uploadTime',
      sortOrder = 'desc'
    } = req.query;
    
    let filteredFiles = [...fileDatabase];
    
    // 应用过滤器
    if (status) {
      filteredFiles = filteredFiles.filter(f => f.status === status);
    }
    
    if (hasAI !== undefined) {
      const hasAIBool = hasAI === 'true';
      filteredFiles = filteredFiles.filter(f => f.hasAIResults === hasAIBool);
    }
    
    if (tagId) {
      filteredFiles = filteredFiles.filter(f => 
        f.tags && f.tags.some(tag => tag.id === parseInt(tagId))
      );
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredFiles = filteredFiles.filter(f => 
        f.originalName.toLowerCase().includes(searchLower) ||
        (f.aiSummary && f.aiSummary.toLowerCase().includes(searchLower))
      );
    }
    
    // 排序
    filteredFiles.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'uploadTime' || sortBy === 'createdAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    // 分页
    const totalFiles = filteredFiles.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedFiles = filteredFiles.slice(startIndex, endIndex);
    
    // 🔧 优化：为每个文件补充完整信息
    const enrichedFiles = paginatedFiles.map(file => ({
      ...file,
      formattedSize: formatFileSize(file.fileSize),
      relativeTime: getRelativeTime(file.uploadTimestamp || new Date(file.createdAt).getTime()),      learningReady: file.status === 'completed' && !!file.content && !!file.aiAnalysis,
      tagCount: file.tags ? file.tags.length : 0
    }));
    
    res.json({
      success: true,
      data: enrichedFiles,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalFiles / limit),
        totalFiles,
        limit: parseInt(limit),
        hasNext: endIndex < totalFiles,
        hasPrev: page > 1
      },
      filters: {
        status,
        hasAI,
        tagId,
        search,
        sortBy,
        sortOrder
      }
    });
    
  } catch (error) {
    console.error('❌ Get file list failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get file list',
      error: error.message
    });
  }
});

// 获取单个文件详情
router.get('/files/:id', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = fileDatabase.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    // 获取文件的标签信息
    const fileTags = database.tags.getFileTags(fileId);
    
    // 补充详细信息
    const enrichedFile = {
      ...file,
      tags: fileTags,
      formattedSize: formatFileSize(file.fileSize),
      relativeTime: getRelativeTime(file.uploadTimestamp || new Date(file.createdAt).getTime()),
      learningReady: file.status === 'completed' && !!file.content && !!file.aiAnalysis
    };
    

    
    res.json({
      success: true,
      data: enrichedFile
    });
    
  } catch (error) {
    console.error('❌ 获取文件详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文件详情失败',
      error: error.message
    });
  }
});

// 文件下载接口权限控制
router.get('/download/:id', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log(`📥 [下载请求] 用户 ${userId} (${userRole}) 尝试下载文件: ${fileId}`);
    
    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      console.log(`❌ [下载失败] 文件不存在: ${fileId}`);
      return res.status(404).json({ success: false, message: '文件不存在' });
    }
    
    console.log(`📋 [文件信息] 找到文件: ${file.originalName}`);
      // 权限控制：非管理员只能下载有权限的文件
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    if (!isAdmin) {
      console.log(`🔍 [权限检查] 普通用户，开始检查权限...`);
      const visibleFileIds = database.fileVisibility.getVisibleFileIdsForUser(userId);
      console.log(`🔍 [权限数据] 用户 ${userId} 可见文件IDs:`, visibleFileIds);
      console.log(`🎯 [权限检查] 请求下载文件ID: ${file.id}`);
      console.log(`🔍 [类型检查] 用户权限列表中的ID类型:`, visibleFileIds.map(id => typeof id));
      console.log(`🔍 [类型检查] 请求的文件ID类型:`, typeof file.id);
      
      // 确保类型一致的比较
      const hasPermission = visibleFileIds.some(id => String(id) === String(file.id));
      
      if (!hasPermission) {
        console.log(`❌ [权限拒绝] 用户 ${userId} 无权限下载文件: ${file.id}`);
        console.log(`📋 [权限详情] 可见文件列表 [${visibleFileIds.join(', ')}] 不包含 ${file.id}`);
        return res.status(403).json({ success: false, message: '无权限下载该文件' });
      }
      console.log(`✅ [权限通过] 用户 ${userId} 有权限下载文件: ${file.id}`);
    } else {
      console.log(`✅ [管理员权限] 管理员 ${userId} 可下载所有文件`);
    }
    
    const filePath = file.uploadPath || file.path;
    
    // 检查物理文件是否存在
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({
        success: false,
        message: '文件不存在或已被删除'
      });
    }
    
    console.log(`📥 开始下载文件: ${file.originalName}`);
    
    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // 发送文件
    res.sendFile(path.resolve(filePath), (error) => {
      if (error) {
        console.error('文件下载失败:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: '文件下载失败',
            error: error.message
          });
        }
      } else {
        console.log(`✅ 文件下载完成: ${file.originalName}`);
      }
    });
    
  } catch (error) {
    console.error('❌ 文件下载处理失败:', error);
    res.status(500).json({
      success: false,
      message: '文件下载失败',
      error: error.message
    });
  }
});

// 🔧 新增：批量删除文件
router.delete('/files/batch', requireAdmin, async (req, res) => {
  try {
    const { fileIds } = req.body;
    
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '文件ID数组不能为空'
      });
    }
    
    console.log(`🗑️ 开始批量删除 ${fileIds.length} 个文件`);
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const fileId of fileIds) {
      try {
        const fileIndex = fileDatabase.findIndex(f => f.id === fileId);
        
        if (fileIndex === -1) {
          results.failed.push({
            id: fileId,
            reason: '文件不存在'
          });
          continue;
        }
        
        const file = fileDatabase[fileIndex];
        
        // 清理标签关联
        try {
          const existingTags = database.tags.getFileTags(fileId);
          for (const tag of existingTags) {
            database.tags.removeFileTag(fileId, tag.id);
          }
        } catch (tagError) {
          console.warn(`清理文件 ${fileId} 标签关联失败:`, tagError);
        }
        
        // 从数据库删除
        try {
          database.files.deleteFile(fileId);
        } catch (dbError) {
          console.warn(`从数据库删除文件 ${fileId} 失败:`, dbError);
        }
        
        // 删除物理文件
        try {
          const filePath = file.uploadPath || file.path;
          if (filePath && await fs.pathExists(filePath)) {
            await fs.remove(filePath);
          }
        } catch (fsError) {
          console.warn(`删除物理文件 ${fileId} 失败:`, fsError);
        }
        
        // 删除RAG索引
        try {
          await ragService.deleteDocumentIndex(fileId);
        } catch (ragError) {
          console.warn(`删除文件 ${fileId} RAG索引失败:`, ragError);
        }
        
        // 从内存删除
        fileDatabase.splice(fileIndex, 1);
        
        results.success.push({  
          id: fileId,
          name: file.originalName
        });
        
        console.log(`✅ 文件删除成功: ${file.originalName}`);
        
      } catch (error) {
        console.error(`删除文件 ${fileId} 失败:`, error);
        results.failed.push({
          id: fileId,
          reason: error.message
        });
      }
    }
    
    console.log(`✅ 批量删除完成: 成功 ${results.success.length} 个，失败 ${results.failed.length} 个`);
    
    // 🔄 发送WebSocket通知
    try {
      webSocketService.notifyFileOperation(req.user?.id || 'admin', 'batch_delete', {
        totalAttempted: fileIds.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        successFiles: results.success,
        failedFiles: results.failed
      });
    } catch (wsError) {
      console.warn('WebSocket通知发送失败:', wsError);
    }
    
    res.json({
      success: true,
      message: `批量删除完成: 成功 ${results.success.length} 个，失败 ${results.failed.length} 个`,
      results
    });
    
  } catch (error) {
    console.error('❌ 批量删除失败:', error);
    res.status(500).json({
      success: false,
      message: '批量删除失败',
      error: error.message
    });
  }
});

// 文件引用计数管理
router.post('/add-reference/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  const userId = req.user?.id || req.body.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: '缺少用户ID' });
  }
  let ref = fileReferences.get(fileId);
  if (!ref) {
    ref = { count: 0, users: new Set() };
    fileReferences.set(fileId, ref);
  }
  ref.count++;
  ref.users.add(userId);
  res.json({ success: true, fileId, count: ref.count, users: Array.from(ref.users) });
});

router.delete('/remove-reference/:fileId/:userId', requireAuth, (req, res) => {
  const { fileId, userId } = req.params;
  let ref = fileReferences.get(fileId);
  if (!ref) {
    return res.status(404).json({ success: false, message: '引用不存在' });
  }
  ref.users.delete(userId);
  ref.count = Math.max(0, ref.count - 1);
  if (ref.count === 0) fileReferences.delete(fileId);
  res.json({ success: true, fileId, count: ref.count, users: Array.from(ref.users) });
});

// 文件锁定管理
router.post('/lock-file/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  const userId = req.user?.id || req.body.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: '缺少用户ID' });
  }
  if (fileLocks.has(fileId)) {
    return res.status(409).json({ success: false, message: '文件已被锁定' });
  }
  fileLocks.set(fileId, { userId, lockedAt: Date.now(), sessionId: req.sessionID });
  res.json({ success: true, fileId, lockedBy: userId });
});

router.delete('/unlock-file/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  const userId = req.user?.id || req.body.userId;
  const lock = fileLocks.get(fileId);
  if (!lock) {
    return res.json({ success: true, message: '文件未被锁定' });
  }
  if (lock.userId !== userId && !req.user?.isAdmin) {
    return res.status(403).json({ success: false, message: '只能解锁自己锁定的文件' });
  }
  fileLocks.delete(fileId);
  res.json({ success: true, fileId, message: '文件解锁成功' });
});

// 🔒 新增：获取文件引用计数API
router.get('/file-references/:fileId', requireAuth, (req, res) => {
  try {
    const { fileId } = req.params;
    const file = fileDatabase.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    const references = fileReferences.get(fileId) || new Set();
    const lock = fileLocks.get(fileId);
    
    // 检查标签关联
    const tagAssociations = database.tags.getFileTagAssociations(fileId);
    
    res.json({
      success: true,
      fileId,
      fileName: file.originalName,
      referenceCount: references.size,
      referencedBy: Array.from(references),
      tagAssociations: tagAssociations.length,
      locked: !!lock,
      lockInfo: lock ? {
        lockedBy: lock.lockedBy,
        lockTime: new Date(lock.lockTime).toISOString(),
        operation: lock.operation,
        duration: Date.now() - lock.lockTime
      } : null,
      canDelete: references.size === 0 && !lock && tagAssociations.length === 0
    });
    
  } catch (error) {
    console.error('获取文件引用失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文件引用失败',
      error: error.message
    });
  }
});

// 🔒 新增：安全删除文件API
router.delete('/safe-delete/:fileId', requireAdmin, (req, res) => {
  try {
    const { fileId } = req.params;
    const { force = false } = req.query;
    
    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    const references = fileReferences.get(fileId) || new Set();
    const lock = fileLocks.get(fileId);
    const tagAssociations = database.tags.getFileTagAssociations(fileId);
    
    // 检查是否可以安全删除
    const hasReferences = references.size > 0;
    const isLocked = !!lock;
    const hasTagAssociations = tagAssociations.length > 0;
    
    if ((hasReferences || isLocked || hasTagAssociations) && !force) {
      return res.status(409).json({
        success: false,
        message: '文件正在使用中，无法删除',
        details: {
          hasReferences,
          referencedBy: Array.from(references),
          isLocked,
          lockInfo: lock,
          hasTagAssociations,
          tagCount: tagAssociations.length
        },
        suggestion: '请等待所有用户完成学习后再删除，或使用强制删除（force=true）'
      });
    }
    
    // 执行删除
    const fileIndex = fileDatabase.findIndex(f => f.id === fileId);
    if (fileIndex !== -1) {
      // 清理引用和锁定
      fileReferences.delete(fileId);
      fileLocks.delete(fileId);
      
      // 清理标签关联
      if (hasTagAssociations) {
        tagAssociations.forEach(assoc => {
          database.tags.removeFileFromTag(assoc.tag_id, fileId);
        });
      }
      
      // 删除文件记录
      const deletedFile = fileDatabase.splice(fileIndex, 1)[0];
      
      // 删除物理文件
      if (deletedFile.uploadPath && fs.existsSync(deletedFile.uploadPath)) {
        fs.unlinkSync(deletedFile.uploadPath);
      }
      
      console.log(`🗑️ 文件已安全删除: ${deletedFile.originalName} (${fileId}), 强制删除: ${force}`);
      
      // 🔄 新增：发送WebSocket通知 - 文件删除
      try {
        webSocketService.notifyFileOperation(req.user?.id || 'admin', 'delete', {
          id: deletedFile.id,
          name: deletedFile.originalName,
          originalName: deletedFile.originalName,
          forced: force,
          hadReferences: hasReferences,
          hadTagAssociations: hasTagAssociations
        });
      } catch (wsError) {
        console.warn('WebSocket通知发送失败:', wsError);
      }
      
      res.json({
        success: true,
        message: '文件删除成功',
        deletedFile: {
          id: deletedFile.id,
          name: deletedFile.originalName
        },
        forced: force
      });
    } else {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
  } catch (error) {
    console.error('安全删除文件失败:', error);
    res.status(500).json({
      success: false,
      message: '删除文件失败',
      error: error.message
    });
  }
});

// 获取文件列表（带可见性过滤）
router.get('/list', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    let files = database.files.getAllFiles();
    
    if (!isAdmin) {
      // 普通用户只看自己可见的文件
      const visibleIds = database.fileVisibility.getVisibleFileIdsForUser(userId);
      files = files.filter(f => visibleIds.includes(f.id));
    } else {
      // 管理员能看到所有文件，并且附加可见用户信息
      files = files.map(file => {
        const visibleUserIds = database.fileVisibility.getVisibleUserIdsForFile(file.id);
        return {
          ...file,
          visibleUserIds
        };
      });
    }
    
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取文件列表失败', error: error.message });
  }
});

// admin设置文件可见用户
router.post('/set-visibility', requireAdmin, async (req, res) => {
  try {
    const { fileId, userIds } = req.body;
    console.log('设置文件可见性:', { fileId, userIds });
    
    if (!fileId || !Array.isArray(userIds)) {
      return res.status(400).json({ success: false, message: '参数错误：需要 fileId 和 userIds 数组' });
    }
    
    const ok = database.fileVisibility.setFileVisibleUsers(fileId, userIds);
    console.log('设置结果:', ok);
    
    if (ok) {
      res.json({ success: true, message: '文件可见性设置成功' });
    } else {
      res.status(500).json({ success: false, message: '设置失败' });
    }
  } catch (error) {
    console.error('设置文件可见性失败:', error);
    res.status(500).json({ success: false, message: '设置失败', error: error.message });
  }
});

// 🔧 调试接口：检查用户文件权限详情
router.get('/debug-permissions/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.params.userId;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'sub_admin';
    
    // 只有管理员或用户本人可以查看权限详情
    if (!isAdmin && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '无权限查看其他用户信息' });
    }
    
    console.log(`🔍 调试用户 ${userId} 的文件权限`);
    
    // 获取用户可见的文件IDs
    const visibleFileIds = database.fileVisibility.getVisibleFileIdsForUser(userId);
    
    // 获取文件数据库中的所有文件
    const { fileDatabase } = require('./upload');
    
    // 检查每个文件的权限情况
    const permissionDetails = fileDatabase.map(file => {
      const hasPermission = visibleFileIds.some(id => String(id) === String(file.id));
      return {
        fileId: file.id,
        fileName: file.originalName,
        fileIdType: typeof file.id,
        hasPermission,
        visibleInPermissionList: visibleFileIds.includes(file.id),
        strictEqual: visibleFileIds.includes(file.id),
        stringEqual: visibleFileIds.some(id => String(id) === String(file.id))
      };
    });
    
    res.json({
      success: true,
      data: {
        userId: userId,
        userIdType: typeof userId,
        visibleFileIds: visibleFileIds,
        visibleFileIdTypes: visibleFileIds.map(id => typeof id),
        totalFiles: fileDatabase.length,
        permissionDetails: permissionDetails,
        summary: {
          totalFilesInDb: fileDatabase.length,
          filesWithPermission: permissionDetails.filter(p => p.hasPermission).length,
          visibleFileIdsCount: visibleFileIds.length
        }
      }
    });
    
  } catch (error) {
    console.error('调试权限失败:', error);
    res.status(500).json({
      success: false,
      message: '调试权限失败',
      error: error.message
    });
  }
});

// 导出路由和相关数据
module.exports = router;
module.exports.fileDatabase = fileDatabase;
module.exports.initializeFileDatabase = initializeFileDatabase;
module.exports.fileReferences = fileReferences;
module.exports.fileLocks = fileLocks;
