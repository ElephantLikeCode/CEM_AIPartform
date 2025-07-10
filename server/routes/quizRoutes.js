const express = require('express');
const router = express.Router();
const aiService = require('../utils/aiService');
const database = require('../database/database'); // 🏷️ 新增：数据库操作
const webSocketService = require('../utils/websocketServiceStub'); // 🔄 临时：WebSocket桩服务
const { requireAuth, requireAdmin } = require('../middleware/auth'); // 🔒 新增：认证中间件

// 内存存储测试数据
let quizSessions = new Map();
let userAnswers = new Map();

// 🔧 新增：题目生成状态管理
let activeGenerations = new Map(); // userId -> generation info
let generationQueue = new Map(); // userId -> generation request

// 🔧 新增：检查用户是否有正在进行的生成
function getUserActiveGeneration(userId) {
  return activeGenerations.get(userId);
}

// 🔧 新增：设置用户生成状态
function setUserGenerationStatus(userId, generationInfo) {
  activeGenerations.set(userId, {
    ...generationInfo,
    startTime: new Date().toISOString(),
    status: 'generating'
  });
}

// 🔧 新增：清除用户生成状态
function clearUserGenerationStatus(userId) {
  activeGenerations.delete(userId);
  generationQueue.delete(userId);
}

// 🔧 新增：获取生成状态接口
router.get('/generation-status/:userId', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const activeGeneration = getUserActiveGeneration(userId);
    
    if (activeGeneration) {
      res.json({
        success: true,
        data: {
          isGenerating: true,
          ...activeGeneration
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          isGenerating: false
        }
      });
    }
  } catch (error) {
    console.error('❌ 获取生成状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取生成状态失败'
    });
  }
});

// 🏷️ 新增：获取可用的测试标签列表 - 使用实时统计
router.get('/tags', async (req, res) => {
  try {
    console.log('🏷️ 获取可用的测试标签列表...');
    
    // 获取所有标签
    const allTags = database.tags.getAllTags();
    
    // 获取文件数据库引用
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    // 筛选出有学习内容的标签
    const availableTags = [];
    
    for (const tag of allTags) {
      try {
        // 获取标签下的文件 - 实时计算
        const tagFiles = database.tags.getTagFiles(tag.id);
        
        // 检查是否有已完成分析的文件 - 实时验证
        const validFiles = tagFiles.filter(tf => {
          const file = fileDatabase.find(f => f.id === tf.file_id);
          return file && file.status === 'completed' && file.aiAnalysis && file.content;
        });
        
        // 🔧 修复：只有当前有有效文件时才显示标签
        if (validFiles.length > 0) {
          // 获取标签的学习内容
          const learningContent = database.tags.getTagLearningContent(tag.id);
          
          // 解析AI分析获取更多信息
          let aiAnalysis = {};
          try {
            aiAnalysis = JSON.parse(learningContent?.ai_analysis || '{}');
          } catch (parseError) {
            aiAnalysis = {};
          }
          
          // 🔔 实时计算文件内容总长度
          let totalContentLength = 0;
          if (learningContent?.merged_content) {
            totalContentLength = learningContent.merged_content.length;
          } else {
            // 如果没有合并内容，计算所有文件内容长度
            totalContentLength = validFiles.reduce((sum, tf) => {
              const file = fileDatabase.find(f => f.id === tf.file_id);
              return sum + (file?.content?.length || 0);
            }, 0);
          }
          
          availableTags.push({
            id: tag.id,
            name: tag.name,
            description: tag.description,
            color: tag.color,
            fileCount: validFiles.length, // 🔔 实时文件数量
            hasLearningContent: !!learningContent,
            summary: aiAnalysis.summary || `基于${validFiles.length}个文档的综合测试`,
            difficulty: aiAnalysis.difficulty || calculateTagDifficulty(validFiles, fileDatabase),
            estimatedTime: aiAnalysis.estimatedLearningTime || Math.max(30, validFiles.length * 10).toString(),
            totalStages: learningContent?.total_stages || Math.max(3, Math.ceil(validFiles.length * 1.5)),
            keyPoints: aiAnalysis.keyPoints?.length || validFiles.length * 3,
            topics: aiAnalysis.topics || ['综合学习'],
            createdAt: tag.created_at,
            contentLength: totalContentLength,
            lastUpdated: new Date().toISOString(), // 🔔 添加更新时间戳
            // 推荐题目数量 - 基于实时文件数量
            recommendedQuestions: Math.min(20, Math.max(5, validFiles.length * 3))
          });
        }
      } catch (error) {
        console.warn(`处理测试标签 ${tag.name} 时出错:`, error);
      }
    }
    
    // Return available quiz tags
    
    res.json({
      success: true,
      data: availableTags,
      total: availableTags.length,
      timestamp: new Date().toISOString(), // 🔔 添加响应时间戳
      message: availableTags.length > 0 ? 
        `找到 ${availableTags.length} 个可用的测试标签` : 
        '暂无可用的测试标签'
    });
    
  } catch (error) {
    console.error('❌ 获取测试标签失败:', error);
    res.status(500).json({
      success: false,
      message: '获取测试标签失败',
      error: error.message
    });
  }
});

// 🏷️ 计算标签难度的辅助函数
function calculateTagDifficulty(validFiles, fileDatabase) {
  if (!validFiles.length) return '中级';
  
  const difficulties = validFiles.map(tf => {
    const file = fileDatabase.find(f => f.id === tf.file_id);
    const diff = file?.aiAnalysis?.difficulty || '中级';
    switch (diff) {
      case '初级': return 1;
      case '中级': return 2; 
      case '高级': return 3;
      default: return 2;
    }
  });
  
  const avgDifficulty = difficulties.reduce((sum, d) => sum + d, 0) / difficulties.length;
  
  if (avgDifficulty <= 1.3) return '初级';
  if (avgDifficulty <= 2.3) return '中级';
  return '高级';
}

// 🔧 修复：标签测试生成，加强内容验证和错误处理
router.post('/generate-tag', async (req, res) => {
  try {
    console.log('🏷️ 收到标签测试生成请求:', req.body);
    
    const { userId, tagId, count = 8, difficulty = '中级', forceRegenerate = false } = req.body;

    console.log('🏷️ 生成标签测试题目请求:', {
      userId, tagId, count, difficulty, forceRegenerate,
      timestamp: new Date().toISOString()
    });

    // 参数验证
    const validationErrors = [];
    
    if (!userId) {
      validationErrors.push('用户ID不能为空');
    } else if (isNaN(parseInt(userId))) {
      validationErrors.push('用户ID必须是有效数字');
    }
    
    if (!tagId) {
      validationErrors.push('标签ID不能为空');
    } else if (isNaN(parseInt(tagId))) {
      validationErrors.push('标签ID必须是有效数字');
    }
    
    if (isNaN(parseInt(count)) || parseInt(count) < 1 || parseInt(count) > 20) {
      validationErrors.push('题目数量必须是1-20之间的数字');
    }
    
    if (!['初级', '中级', '高级'].includes(difficulty)) {
      validationErrors.push('难度等级必须是：初级、中级或高级');
    }
    
    if (validationErrors.length > 0) {
      console.error('❌ 标签测试参数验证失败:', validationErrors);
      return res.status(400).json({
        success: false,
        message: '缺少必要的测试参数',
        errors: validationErrors
      });
    }

    // 验证标签是否存在
    const tag = database.get('SELECT * FROM tags WHERE id = ?', [parseInt(tagId)]);
    if (!tag) {
      console.error('❌ 标签不存在:', tagId);
      return res.status(404).json({
        success: false,
        message: '指定的标签不存在'
      });
    }

    // 🔧 改进：获取标签下的文件和内容
    console.log(`📚 开始验证标签"${tag.name}"的学习内容...`);
    
    const tagFiles = database.tags.getTagFiles(parseInt(tagId));
    if (tagFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: `标签"${tag.name}"下没有任何文件，无法生成测试`
      });
    }
    
    // 验证文件内容
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    const validFiles = tagFiles.filter(tf => {
      const file = fileDatabase.find(f => f.id === tf.file_id);
      return file && file.status === 'completed' && file.aiAnalysis && file.content && file.content.length > 100;
    });
    
    if (validFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: `标签"${tag.name}"下没有已完成分析的文件，无法生成测试`
      });
    }
    
    console.log(`📄 标签"${tag.name}"下有${validFiles.length}个有效文件`);
    
    // 🔧 改进：优先使用学习内容，如果没有则动态生成
    let learningContent = database.tags.getTagLearningContent(parseInt(tagId));
    let contentForTest = '';
    
    if (learningContent && learningContent.merged_content && learningContent.merged_content.length > 200) {
      contentForTest = learningContent.merged_content;
      console.log(`✅ 使用现有的标签学习内容，长度: ${contentForTest.length}字符`);
    } else {
      console.log(`🔄 标签学习内容不足，动态合并文件内容...`);
      
      // 动态合并文件内容
      let mergedContent = '';
      for (const tagFile of validFiles) {
        const file = fileDatabase.find(f => f.id === tagFile.file_id);
        if (file && file.content) {
          mergedContent += `\n\n=== 文档：${file.originalName} ===\n${file.content}`;
        }
      }
      
      if (mergedContent.length < 200) {
        return res.status(400).json({
          success: false,
          message: `标签"${tag.name}"下的文件内容不足，无法生成有效测试`
        });
      }
      
      contentForTest = mergedContent;
      console.log(`✅ 动态合并了${validFiles.length}个文件的内容，长度: ${contentForTest.length}字符`);
    }

    // 检查AI服务可用性
    console.log('🔍 检查AI服务可用性...');
    const aiAvailable = await aiService.checkModelAvailability();
    
    if (!aiAvailable) {
      console.error('❌ AI服务不可用');
      return res.status(503).json({
        success: false,
        message: 'AI服务暂时不可用，请稍后重试',
        retryable: true
      });
    }
    console.log('✅ AI服务可用');

    console.log('📚 开始生成基于标签的测试题目...');
    
    try {
      // 🔧 修复：直接使用generateQuestions方法而不是generateTagQuestions
      const questionsResult = await aiService.generateQuestions(
        contentForTest,
        1, // 综合测试阶段
        difficulty,
        parseInt(count)
      );

      console.log('🔍 标签AI生成结果:', {
        hasQuestions: !!questionsResult?.questions,
        questionCount: questionsResult?.questions?.length || 0
      });

      // 验证生成结果
      if (!questionsResult?.questions || questionsResult.questions.length === 0) {
        throw new Error('AI未能生成有效的标签测试题目，请稍后重试');
      }

      // 为题目添加标签信息
      const enrichedQuestions = questionsResult.questions.map(q => ({
        ...q,
        isTagQuestion: true,
        tagId: parseInt(tagId),
        tagName: tag.name,
        sourceFiles: validFiles.map(tf => {
          const file = fileDatabase.find(f => f.id === tf.file_id);
          return file ? file.originalName : '未知文件';
        })
      }));

      // 创建测试会话
      const timestamp = Date.now();
      const sessionId = `tag_quiz_${userId}_${tagId}_${timestamp}`;
      const quizSession = {
        sessionId,
        userId: parseInt(userId),
        tagId: parseInt(tagId),
        tagName: tag.name,
        testType: 'tag_comprehensive',
        difficulty: difficulty,
        questions: enrichedQuestions,
        startTime: new Date().toISOString(),
        status: 'active',
        contentSource: 'tag_ai_generated',
        regenerated: forceRegenerate || false,
        fileCount: validFiles.length
      };
      
      // 存储会话
      if (!global.quizSessions) {
        global.quizSessions = new Map();
      }
      global.quizSessions.set(sessionId, quizSession);
        console.log(`✅ 标签测试会话创建成功: ${sessionId}, 题目数量: ${enrichedQuestions.length}`);
      
      // 🔄 新增：发送WebSocket通知 - 测验生成成功
      try {
        webSocketService.notifyQuizStatus(parseInt(userId), {
          type: 'quiz_generated',
          sessionId: sessionId,
          testType: 'tag_comprehensive',
          tagId: parseInt(tagId),
          tagName: tag.name,
          difficulty: difficulty,
          questionCount: enrichedQuestions.length,
          fileCount: validFiles.length,
          regenerated: forceRegenerate || false,
          generatedAt: new Date().toISOString()
        });
      } catch (wsError) {
        console.warn('WebSocket通知发送失败:', wsError);
      }
      
      // 返回响应
      return res.json({
        success: true,
        data: {
          sessionId,
          tagId: parseInt(tagId),
          tagName: tag.name,
          testType: 'tag_comprehensive',
          difficulty: difficulty,
          questionCount: enrichedQuestions.length,
          questions: enrichedQuestions.map(q => ({
            id: q.id,
            type: q.type,
            question: q.question,
            options: q.options
            // 不返回正确答案和解释
          })),
          contentSource: 'tag_ai_generated',
          regenerated: forceRegenerate || false,
          fileCount: validFiles.length
        },
        message: forceRegenerate ? 
          `重新生成标签"${tag.name}"测试成功` : 
          `基于标签"${tag.name}"生成综合测试成功`
      });
      
    } catch (aiError) {
      console.error('❌ 标签AI题目生成失败:', aiError);
      return res.status(500).json({
        success: false,
        message: `AI题目生成失败: ${aiError.message}`,
        suggestion: 'AI生成过程中出现问题，请重试或选择其他标签',
        retryable: true
      });
    }
    
  } catch (error) {
    console.error('❌ 标签题目生成失败:', {
      error: error.message,
      request: req.body,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: '标签测试生成失败: ' + error.message,
      error: error.message,
      retryable: !error.message.includes('参数') && !error.message.includes('不存在')
    });
  }
});

// 🔧 修复：生成单文件测试题目，加强参数验证
router.post('/generate', async (req, res) => {
  try {
    console.log('📄 收到文件测试生成请求:', req.body);
    
    const { userId, fileId, count = 8, difficulty = '中级' } = req.body;

    console.log('📄 生成文件测试题目请求:', {
      userId, fileId, count, difficulty,
      timestamp: new Date().toISOString()
    });

    // 🔧 加强参数验证，提供更详细的错误信息
    const validationErrors = [];
    
    if (!userId) {
      validationErrors.push('用户ID不能为空');
    } else if (isNaN(parseInt(userId))) {
      validationErrors.push('用户ID必须是有效数字');
    }
    
    if (!fileId) {
      validationErrors.push('文件ID不能为空');
    }
    
    if (isNaN(parseInt(count)) || parseInt(count) < 1 || parseInt(count) > 20) {
      validationErrors.push('题目数量必须是1-20之间的数字');
    }
    
    if (!['初级', '中级', '高级'].includes(difficulty)) {
      validationErrors.push('难度等级必须是：初级、中级或高级');
    }
    
    if (validationErrors.length > 0) {
      console.error('❌ 文件测试参数验证失败:', validationErrors);
      return res.status(400).json({
        success: false,
        message: '缺少必要的测试参数',
        errors: validationErrors,
        details: {
          received: { userId, fileId, count, difficulty },
          expected: {
            userId: '数字类型的用户ID',
            fileId: '字符串类型的文件ID',
            count: '1-20之间的数字',
            difficulty: '初级/中级/高级'
          }
        }
      });
    }

    // 获取文件信息
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    if (!fileDatabase || !Array.isArray(fileDatabase)) {
      console.error('❌ 文件数据库不可用');
      return res.status(500).json({
        success: false,
        message: '文件数据库服务不可用',
        suggestion: '请联系管理员检查服务状态'
      });
    }
    
    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      console.error('❌ 文件不存在:', fileId);
      return res.status(404).json({
        success: false,
        message: '指定的文件不存在',
        suggestion: '请刷新页面后重新选择文件'
      });
    }

    if (file.status !== 'completed' || !file.aiAnalysis || !file.content) {
      console.error('❌ 文件状态不符合测试要求:', {
        status: file.status,
        hasAiAnalysis: !!file.aiAnalysis,
        hasContent: !!file.content,
        fileName: file.originalName
      });
      
      return res.status(400).json({
        success: false,
        message: `文件"${file.originalName}"尚未完成AI分析，无法生成测试`,
        suggestion: '请等待文件分析完成后再试',
        details: {
          currentStatus: file.status,
          needsAnalysis: !file.aiAnalysis,
          needsContent: !file.content
        }
      });
    }

    // 检查AI服务可用性
    console.log('🔍 检查AI服务可用性...');
    const aiAvailable = await aiService.checkModelAvailability();
    
    if (!aiAvailable) {
      console.error('❌ AI服务不可用');
      return res.status(503).json({
        success: false,
        message: 'AI服务暂时不可用，请稍后重试',
        suggestion: '请确保Ollama运行正常并已加载模型',
        retryable: true
      });
    }
    console.log('✅ AI服务可用');

    console.log('📚 开始生成基于文件的测试题目...');
    
    try {
      // 使用文件内容生成题目
      const questionsResult = await aiService.generateQuestions(
        file.content,
        1, // 单文件测试使用第1阶段
        difficulty,
        parseInt(count)
      );

      console.log('🔍 文件AI生成结果:', {
        hasQuestions: !!questionsResult?.questions,
        questionCount: questionsResult?.questions?.length || 0
      });

      // 验证生成结果
      if (!questionsResult?.questions || questionsResult.questions.length === 0) {
        throw new Error('AI未能生成有效的文件测试题目，请稍后重试');
      }

      // 创建测试会话
      const timestamp = Date.now();
      const sessionId = `file_quiz_${userId}_${fileId}_${timestamp}`;
      const quizSession = {
        sessionId,
        userId: parseInt(userId),
        fileId: fileId,
        fileName: file.originalName,
        testType: 'file_comprehensive',
        difficulty: difficulty,
        questions: questionsResult.questions,
        startTime: new Date().toISOString(),
        status: 'active',
        contentSource: 'file_ai_generated'
      };
      
      // 存储会话
      if (!global.quizSessions) {
        global.quizSessions = new Map();
      }
      global.quizSessions.set(sessionId, quizSession);
      
      console.log(`✅ 文件测试会话创建成功: ${sessionId}, 题目数量: ${questionsResult.questions.length}`);
      
      // 返回响应
      return res.json({
        success: true,
        sessionId,
        fileId: fileId,
        fileName: file.originalName,
        testType: 'file_comprehensive',
        difficulty: difficulty,
        questionCount: questionsResult.questions.length,
        questions: questionsResult.questions.map(q => ({
          id: q.id,
          type: q.type,
          question: q.question,
          options: q.options
          // 不返回正确答案和解释
        })),
        contentSource: 'file_ai_generated',
        message: `基于文件"${file.originalName}"生成测试成功`
      });
      
    } catch (aiError) {
      console.error('❌ 文件AI题目生成失败:', aiError);
      return res.status(500).json({
        success: false,
        message: `AI题目生成失败: ${aiError.message}`,
        suggestion: 'AI生成过程中出现问题，请重试或选择其他文件',
        retryable: true
      });
    }
    
  } catch (error) {
    console.error('❌ 文件题目生成失败:', {
      error: error.message,
      request: req.body,
      timestamp: new Date().toISOString()
    });
    
    // 根据错误类型提供更详细的建议
    let suggestion = '请检查文件内容完整性或稍后重试';
    if (error.message.includes('AI服务')) {
      suggestion = '请检查Ollama服务是否正常运行，并确保已加载正确的模型';
    } else if (error.message.includes('分析')) {
      suggestion = '请等待文件AI分析完成后再试';
    } else if (error.message.includes('JSON') || error.message.includes('格式')) {
      suggestion = 'AI生成内容格式问题，请重新尝试';
    }
    
    return res.status(500).json({
      success: false,
      message: '文件测试生成失败: ' + error.message,
      error: error.message,
      suggestion: suggestion,
      retryable: !error.message.includes('参数') && !error.message.includes('不存在')
    });
  }
});

// 🏷️ 修复：获取可用的学习材料（用于测试选择页面）- 添加权限控制
router.get('/materials', requireAuth, async (req, res) => {
  try {
    console.log('📚 获取测试可用的学习材料...');
    
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'sub_admin';
    
    // 获取文件数据库
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    // 获取标签数据库
    const database = require('../database/database');
    
    const materials = {
      files: [],
      tags: []
    };
    
    // 1. 获取可用的文件材料 - 加入权限控制
    if (fileDatabase && fileDatabase.length > 0) {
      let accessibleFiles = fileDatabase;
      
      // 🔒 权限控制：非管理员只能看到分配给自己的文件
      if (!isAdmin) {
        const visibleFileIds = database.fileVisibility.getVisibleFileIdsForUser(userId);
        accessibleFiles = fileDatabase.filter(file => visibleFileIds.includes(file.id));
        console.log(`🔒 用户${userId}可访问的文件: ${accessibleFiles.length}/${fileDatabase.length}`);
      }
      
      const completedFiles = accessibleFiles.filter(file => 
        file.status === 'completed' && 
        file.aiAnalysis && 
        file.content &&
        file.content.length > 100
      );
      
      materials.files = completedFiles.map(file => ({
        id: file.id,
        name: file.originalName,
        type: 'file',
        summary: file.aiAnalysis.summary?.substring(0, 150) + '...' || '文件学习材料',
        stages: file.aiAnalysis.learningStages?.length || 1,
        keyPoints: file.aiAnalysis.keyPoints?.length || 0,
        difficulty: file.aiAnalysis.difficulty || '中级',
        estimatedTime: file.aiAnalysis.estimatedLearningTime || '30',
        fileType: file.fileType,
        uploadTime: file.uploadTime || file.createdAt,
        contentLength: file.content.length
      }));
      
      console.log(`📄 找到 ${materials.files.length} 个可用文件`);
    }
      // 2. 获取可用的标签材料 - 加入权限控制
    try {
      const allTags = database.tags.getAllTags();
      
      for (const tag of allTags) {
        try {
          // 获取标签下的文件
          const tagFiles = database.tags.getTagFiles(tag.id);
          
          // 🔒 权限控制：过滤用户可访问的文件
          let accessibleTagFiles = tagFiles;
          if (!isAdmin) {
            const visibleFileIds = database.fileVisibility.getVisibleFileIdsForUser(userId);
            accessibleTagFiles = tagFiles.filter(tf => visibleFileIds.includes(tf.file_id));
          }
          
          // 检查是否有已完成分析的文件
          const validFiles = accessibleTagFiles.filter(tf => {
            const file = fileDatabase.find(f => f.id === tf.file_id);
            return file && file.status === 'completed' && file.aiAnalysis && file.content;
          });
          
          if (validFiles.length > 0) {
            // 获取标签的学习内容（如果有）
            const learningContent = database.tags.getTagLearningContent(tag.id);
            
            let analysis = {};
            let totalContentLength = 0;
            
            if (learningContent) {
              try {
                analysis = JSON.parse(learningContent.ai_analysis || '{}');
                totalContentLength = learningContent.merged_content?.length || 0;
              } catch (parseError) {
                console.warn(`解析标签 ${tag.id} 学习内容失败:`, parseError);
              }
            }
            
            // 计算文件总内容长度
            if (!totalContentLength) {
              totalContentLength = validFiles.reduce((sum, tf) => {
                const file = fileDatabase.find(f => f.id === tf.file_id);
                return sum + (file?.content?.length || 0);
              }, 0);
            }
            
            materials.tags.push({
              id: tag.id,
              name: tag.name,
              type: 'tag',
              description: tag.description,
              color: tag.color,
              fileCount: validFiles.length,
              summary: analysis.summary?.substring(0, 150) + '...' || 
                      `${tag.name} - 综合学习材料，包含${validFiles.length}个文档`,
              stages: learningContent?.total_stages || Math.max(3, Math.ceil(validFiles.length * 1.5)),
              keyPoints: analysis.keyPoints?.length || validFiles.length * 3,
              difficulty: analysis.difficulty || calculateTagDifficulty(validFiles, fileDatabase),
              estimatedTime: analysis.estimatedLearningTime || 
                           Math.max(60, validFiles.length * 20).toString(),
              hasLearningContent: !!learningContent,
              contentLength: totalContentLength,
              createdAt: tag.created_at
            });
          }
        } catch (tagError) {
          console.warn(`处理标签 ${tag.name} 时出错:`, tagError);
        }
      }
      
      console.log(`🏷️ 找到 ${materials.tags.length} 个可用标签`);
    } catch (tagError) {
      console.error('获取标签材料失败:', tagError);
    }
    
    const totalMaterials = materials.files.length + materials.tags.length;
    
    console.log(`✅ 总共找到 ${totalMaterials} 个可用学习材料`);
    
    res.json({
      success: true,
      data: materials,
      total: totalMaterials,
      message: totalMaterials > 0 ? 
        `找到 ${totalMaterials} 个可用的学习材料` : 
        '暂无可用的学习材料，请先上传文件并完成AI分析'
    });
    
  } catch (error) {
    console.error('❌ 获取学习材料失败:', error);
    res.status(500).json({
      success: false,
      message: '获取学习材料失败',
      error: error.message
    });
  }
});

// 🆕 新增：统一的题目生成端点 - 支持文件和标签两种模式
router.post('/generate-questions', async (req, res) => {
  try {
    console.log('🎯 收到统一题目生成请求:', JSON.stringify(req.body, null, 2));
    console.log('🎯 请求头信息:', req.headers['content-type']);    const { 
      userId, 
      type, // 'file' 或 'tag'
      fileId, 
      tagId, 
      count = 8, 
      difficulty = '中级',
      forceRegenerate = false,
      selectedModel, // 🤖 修复：前端传递的参数名
      model = 'local' // 🤖 保持兼容性
    } = req.body;
    
    // 🤖 修复：优先使用selectedModel，没有则使用model，默认local
    const finalModel = selectedModel || model || 'local';    console.log('🎯 统一题目生成请求参数:', {
      userId, 
      type, 
      fileId, 
      tagId, 
      count, 
      difficulty, 
      forceRegenerate,
      selectedModel, // 🤖 记录原始参数
      model, // 🤖 记录兼容参数
      finalModel, // 🤖 记录最终使用的模型
      userIdType: typeof userId,
      tagIdType: typeof tagId,
      countType: typeof count,
      timestamp: new Date().toISOString()
    });

    // 🔧 新增：检查用户是否已有正在进行的生成
    const userIdNum = parseInt(userId);
    const existingGeneration = getUserActiveGeneration(userIdNum);
    
    if (existingGeneration && !forceRegenerate) {
      console.log('⚠️ 用户已有正在进行的题目生成:', existingGeneration);
      return res.status(409).json({
        success: false,
        message: '您已有正在进行的题目生成，请等待完成或取消后再试',
        code: 'GENERATION_IN_PROGRESS',
        data: {
          activeGeneration: existingGeneration
        }
      });
    }

    // 🔧 改进参数验证 - 提供更详细的错误信息
    const validationErrors = [];
    
    // 验证用户ID
    if (!userId) {
      validationErrors.push('用户ID不能为空');
    } else {
      const userIdNum = parseInt(userId);
      if (isNaN(userIdNum) || userIdNum <= 0) {
        validationErrors.push(`用户ID必须是有效的正整数，当前值: ${userId} (类型: ${typeof userId})`);
      }
    }
    
    // 验证类型
    if (!type) {
      validationErrors.push('类型参数不能为空');
    } else if (!['file', 'tag'].includes(type)) {
      validationErrors.push(`类型必须是 'file' 或 'tag'，当前值: ${type} (类型: ${typeof type})`);
    }
    
    // 根据类型验证对应的ID
    if (type === 'file') {
      if (!fileId) {
        validationErrors.push('文件模式下文件ID不能为空');
      } else if (typeof fileId !== 'string' || fileId.trim().length === 0) {
        validationErrors.push(`文件ID必须是有效字符串，当前值: ${fileId} (类型: ${typeof fileId})`);
      }
    }
    
    if (type === 'tag') {
      if (!tagId) {
        validationErrors.push('标签模式下标签ID不能为空');
      } else {
        const tagIdNum = parseInt(tagId);
        if (isNaN(tagIdNum) || tagIdNum <= 0) {
          validationErrors.push(`标签ID必须是有效的正整数，当前值: ${tagId} (类型: ${typeof tagId})`);
        }
      }
    }
    
    // 验证题目数量
    const countNum = parseInt(count);
    if (isNaN(countNum) || countNum < 1 || countNum > 20) {
      validationErrors.push(`题目数量必须是1-20之间的数字，当前值: ${count} (类型: ${typeof count})`);
    }
    
    // 验证难度
    if (!['初级', '中级', '高级'].includes(difficulty)) {
      validationErrors.push(`难度等级必须是：初级、中级或高级，当前值: ${difficulty}`);
    }
    
    // 如果有验证错误，返回详细信息
    if (validationErrors.length > 0) {
      console.error('❌ 统一题目生成参数验证失败:', {
        errors: validationErrors,
        receivedParams: { userId, type, fileId, tagId, count, difficulty, forceRegenerate },
        bodyType: typeof req.body,
        bodyKeys: Object.keys(req.body)
      });
      
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: validationErrors,
        receivedParams: { 
          userId: { value: userId, type: typeof userId },
          type: { value: type, type: typeof type },
          fileId: { value: fileId, type: typeof fileId },
          tagId: { value: tagId, type: typeof tagId },
          count: { value: count, type: typeof count },
          difficulty: { value: difficulty, type: typeof difficulty },
          forceRegenerate: { value: forceRegenerate, type: typeof forceRegenerate }
        },
        expectedFormat: {
          userId: '正整数 (如: 1)',
          type: "'file' 或 'tag'",
          fileId: '字符串 (当type为file时必需)',
          tagId: '正整数 (当type为tag时必需)',
          count: '1-20之间的整数',
          difficulty: "'初级'、'中级' 或 '高级'",
          forceRegenerate: '布尔值 (可选)'
        }
      });
    }

    // 🔧 统一错误处理函数
    const handleError = (error, context) => {
      console.error(`❌ ${context}失败:`, error);
      
      let statusCode = 500;
      let message = `${context}失败: ${error.message}`;
      let suggestion = '请稍后重试';
      
      if (error.message.includes('不存在')) {
        statusCode = 404;
        suggestion = '请刷新页面后重新选择';
      } else if (error.message.includes('未完成') || error.message.includes('分析')) {
        statusCode = 400;
        suggestion = '请等待AI分析完成后再试';
      } else if (error.message.includes('AI服务')) {
        statusCode = 503;
        suggestion = '请检查AI服务状态';
      } else if (error.message.includes('内容不足')) {
        statusCode = 400;
        suggestion = '请确保文件内容完整';
      }
      
      return res.status(statusCode).json({
        success: false,
        message,
        suggestion,
        error: error.message,
        retryable: statusCode !== 404 && statusCode !== 400
      });
    };

    try {      // 根据类型调用相应的生成逻辑
      if (type === 'file') {
        console.log('📄 处理文件测试生成');
        
        // 🔧 新增：设置文件生成状态
        setUserGenerationStatus(userIdNum, {
          type: 'file',
          fileId: fileId,
          difficulty: difficulty,
          questionCount: countNum,
          status: 'generating'
        });
        
        try {
          // 获取文件信息
          const uploadModule = require('./upload');
          const { fileDatabase } = uploadModule;
          
          if (!fileDatabase || !Array.isArray(fileDatabase)) {
            throw new Error('文件数据库服务不可用');
          }
          
          const file = fileDatabase.find(f => f.id === fileId);
          if (!file) {
            throw new Error(`文件ID ${fileId} 不存在`);
          }

          if (file.status !== 'completed') {
            throw new Error(`文件"${file.originalName}"状态为${file.status}，未完成处理`);
          }
          
          if (!file.aiAnalysis) {
            throw new Error(`文件"${file.originalName}"缺少AI分析结果`);
          }
          
          if (!file.content || file.content.length < 100) {
            throw new Error(`文件"${file.originalName}"内容不足，无法生成测试`);
          }

          // 检查AI服务
          console.log('🔍 检查AI服务可用性...');
          const aiAvailable = await aiService.checkModelAvailability();
          if (!aiAvailable) {
            throw new Error('AI服务暂时不可用，请稍后重试');
          }          // 生成题目
          console.log(`📚 为文件"${file.originalName}"使用${finalModel}模型生成${countNum}道${difficulty}题目...`);
          const questionsResult = await aiService.generateQuestions(
            file.content,
            1,
            difficulty,
            countNum,
            finalModel // 🤖 修复：使用最终确定的模型参数
          );

          if (!questionsResult?.questions || questionsResult.questions.length === 0) {
            throw new Error('AI未能生成有效的文件测试题目');
          }

          // 创建会话
        const timestamp = Date.now();
        const sessionId = `file_quiz_${userId}_${fileId}_${timestamp}`;
        const quizSession = {
          sessionId,
          userId: parseInt(userId),
          fileId: fileId,
          fileName: file.originalName,
          testType: 'file_comprehensive',
          difficulty: difficulty,
          questions: questionsResult.questions,
          startTime: new Date().toISOString(),
          status: 'active',
          contentSource: 'file_ai_generated'
        };
        
        if (!global.quizSessions) {
          global.quizSessions = new Map();
        }
        global.quizSessions.set(sessionId, quizSession);
            console.log(`✅ 文件测试会话创建成功: ${sessionId}, 题目数量: ${questionsResult.questions.length}`);
          
          // 🔧 新增：清除生成状态
          clearUserGenerationStatus(userIdNum);
          
          return res.json({
            success: true,
            data: {
              sessionId,
              type: 'file',
              fileId: fileId,
              fileName: file.originalName,
              testType: 'file_comprehensive',
              difficulty: difficulty,
              questionCount: questionsResult.questions.length,
              questions: questionsResult.questions.map(q => ({
                id: q.id,
                type: q.type,
                question: q.question,
                options: q.options
              }))
            },
            message: `基于文件"${file.originalName}"生成${questionsResult.questions.length}道测试题目成功`
          });
          
        } catch (fileGenerationError) {
          // 🔧 新增：文件生成失败时清除状态
          clearUserGenerationStatus(userIdNum);
          throw fileGenerationError;
        }
          } else if (type === 'tag') {
        console.log('🏷️ 处理标签测试生成');
        
        // 🔧 新增：设置标签生成状态
        setUserGenerationStatus(userIdNum, {
          type: 'tag',
          tagId: parseInt(tagId),
          difficulty: difficulty,
          questionCount: countNum,
          status: 'generating'
        });
        
        try {
          // 验证标签
          const tag = database.get('SELECT * FROM tags WHERE id = ?', [parseInt(tagId)]);
          if (!tag) {
            throw new Error(`标签ID ${tagId} 不存在`);
          }

          // 获取标签文件
          const tagFiles = database.tags.getTagFiles(parseInt(tagId));
          if (tagFiles.length === 0) {
            throw new Error(`标签"${tag.name}"下没有任何文件，无法生成测试`);
          }
        
        const uploadModule = require('./upload');
        const { fileDatabase } = uploadModule;
        
        const validFiles = tagFiles.filter(tf => {
          const file = fileDatabase.find(f => f.id === tf.file_id);
          return file && file.status === 'completed' && file.aiAnalysis && file.content && file.content.length > 100;
        });
        
        if (validFiles.length === 0) {
          throw new Error(`标签"${tag.name}"下没有已完成分析的文件，无法生成测试`);
        }

        console.log(`📄 标签"${tag.name}"下有${validFiles.length}个有效文件`);

        // 获取学习内容
        let learningContent = database.tags.getTagLearningContent(parseInt(tagId));
        let contentForTest = '';
        
        if (learningContent && learningContent.merged_content && learningContent.merged_content.length > 200) {
          contentForTest = learningContent.merged_content;
          console.log(`✅ 使用现有的标签学习内容，长度: ${contentForTest.length}字符`);
        } else {
          console.log(`🔄 动态合并文件内容...`);
          let mergedContent = '';
          for (const tagFile of validFiles) {
            const file = fileDatabase.find(f => f.id === tagFile.file_id);
            if (file && file.content) {
              mergedContent += `\n\n=== 文档：${file.originalName} ===\n${file.content}`;
            }
          }
          
          if (mergedContent.length < 200) {
            throw new Error(`标签"${tag.name}"下的文件内容不足，无法生成有效测试`);
          }
          
          contentForTest = mergedContent;
          console.log(`✅ 动态合并了${validFiles.length}个文件的内容，长度: ${contentForTest.length}字符`);
        }

        // 检查AI服务
        console.log('🔍 检查AI服务可用性...');
        const aiAvailable = await aiService.checkModelAvailability();
        if (!aiAvailable) {
          throw new Error('AI服务暂时不可用，请稍后重试');
        }        // 生成题目
        console.log(`📚 为标签"${tag.name}"使用${finalModel}模型生成${countNum}道${difficulty}题目...`);
        const questionsResult = await aiService.generateQuestions(
          contentForTest,
          1,
          difficulty,
          countNum,
          finalModel // 🤖 修复：使用最终确定的模型参数
        );

        if (!questionsResult?.questions || questionsResult.questions.length === 0) {
          throw new Error('AI未能生成有效的标签测试题目');
        }

        // 为题目添加标签信息
        const enrichedQuestions = questionsResult.questions.map(q => ({
          ...q,
          isTagQuestion: true,
          tagId: parseInt(tagId),
          tagName: tag.name,
          sourceFiles: validFiles.map(tf => {
            const file = fileDatabase.find(f => f.id === tf.file_id);
            return file ? file.originalName : '未知文件';
          })
        }));

        // 创建会话
        const timestamp = Date.now();
        const sessionId = `tag_quiz_${userId}_${tagId}_${timestamp}`;
        const quizSession = {
          sessionId,
          userId: parseInt(userId),
          tagId: parseInt(tagId),
          tagName: tag.name,
          testType: 'tag_comprehensive',
          difficulty: difficulty,
          questions: enrichedQuestions,
          startTime: new Date().toISOString(),
          status: 'active',
          contentSource: 'tag_ai_generated',
          regenerated: forceRegenerate || false,
          fileCount: validFiles.length
        };
        
        if (!global.quizSessions) {
          global.quizSessions = new Map();
        }
        global.quizSessions.set(sessionId, quizSession);
          console.log(`✅ 标签测试会话创建成功: ${sessionId}, 题目数量: ${enrichedQuestions.length}`);
        
        // 🔧 新增：清除生成状态
        clearUserGenerationStatus(userIdNum);
        
        return res.json({
          success: true,
          data: {
            sessionId,
            type: 'tag',
            tagId: parseInt(tagId),
            tagName: tag.name,
            testType: 'tag_comprehensive',
            difficulty: difficulty,
            questionCount: enrichedQuestions.length,
            questions: enrichedQuestions.map(q => ({
              id: q.id,
              type: q.type,
              question: q.question,
              options: q.options
            })),
            contentSource: 'tag_ai_generated',
            regenerated: forceRegenerate || false,
            fileCount: validFiles.length
          },          message: `基于标签"${tag.name}"生成${enrichedQuestions.length}道综合测试题目成功`
        });
        
        } catch (tagGenerationError) {
          // 🔧 新增：标签生成失败时清除状态
          clearUserGenerationStatus(userIdNum);
          throw tagGenerationError;
        }
      }
      
    } catch (generationError) {
      // 🔧 新增：任何生成错误都要清除状态
      clearUserGenerationStatus(userIdNum);
      return handleError(generationError, type === 'file' ? '文件测试生成' : '标签测试生成');
    }
    
  } catch (error) {
    console.error('❌ 统一题目生成失败:', {
      error: error.message,
      stack: error.stack,
      request: req.body,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: '题目生成失败: ' + error.message,
      error: error.message,
      retryable: true
    });
  }
});

// 🔧 新增：支持模型选择的题目生成端点
router.post('/generate-with-model', async (req, res) => {
  try {
    const { materialId, tagId, questionCount = 10, difficulty = 'medium', model = 'local', testType } = req.body;
    
    console.log(`🎯 开始生成题目 (模型: ${model})`);
    console.log('📋 参数:', { materialId, tagId, questionCount, difficulty, testType });
    
    // 验证参数
    if (!materialId && !tagId) {
      return res.status(400).json({
        success: false,
        message: '必须提供材料ID或标签ID'
      });
    }

    // 创建生成会话ID
    const sessionId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let questionsResult;
    
    if (model === 'deepseek') {
      // 使用DeepSeek API生成题目
      const deepseekService = require('../utils/deepseekService');
      
      // 检查DeepSeek可用性
      const isAvailable = await deepseekService.checkAvailability();
      if (!isAvailable) {
        return res.status(503).json({
          success: false,
          message: 'DeepSeek API不可用，请检查配置'
        });
      }
      
      if (tagId) {
        // 标签模式
        questionsResult = await deepseekService.generateTagQuestions(
          tagId,
          questionCount,
          difficulty
        );
      } else {
        // 文件模式
        questionsResult = await deepseekService.generateFileQuestions(
          materialId,
          questionCount,
          difficulty
        );
      }
      
    } else {
      // 使用本地AI模型
      const aiService = require('../utils/aiService');
      
      if (tagId) {
        // 标签模式
        questionsResult = await aiService.generateQuestions(
          null, // materialId
          questionCount,
          difficulty,
          tagId // tagId
        );
      } else {
        // 文件模式
        questionsResult = await aiService.generateQuestions(
          materialId,
          questionCount,
          difficulty
        );
      }
    }

    // 保存题目到数据库（如果需要）
    const questions = questionsResult.questions || questionsResult;
    
    res.json({
      success: true,
      message: `${model === 'deepseek' ? 'DeepSeek' : '本地'}AI题目生成完成`,
      data: {
        sessionId,
        questions,
        model,
        testType,
        materialId,
        tagId,
        difficulty,
        questionCount: questions.length
      }
    });

  } catch (error) {
    console.error('❌ 题目生成失败:', error);
    res.status(500).json({
      success: false,
      message: '题目生成失败',
      error: error.message
    });
  }
});

// 提交答案 - 支持标签和文件两种测试
router.post('/submit', async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    
    console.log('📝 提交答案:', { sessionId, answerCount: answers?.length });
    
    if (!sessionId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: sessionId, answers'
      });
    }

    // 从全局或本地会话存储中获取会话
    let session = null;
    if (global.quizSessions && global.quizSessions.has(sessionId)) {
      session = global.quizSessions.get(sessionId);
    } else if (quizSessions.has && quizSessions.has(sessionId)) {
      session = quizSessions.get(sessionId);
    }

    if (!session) {
      return res.status(404).json({
        success: false,
        message: '测试会话不存在或已过期'
      });
    }

    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: '测试会话已结束'
      });
    }

    // 改进的答案比较函数
    function compareAnswers(userAnswer, correctAnswer, questionType, options) {
      console.log(`🔍 答案比较详情:`, {
        type: questionType,
        userAnswer,
        userAnswerType: typeof userAnswer,
        correctAnswer,
        correctAnswerType: typeof correctAnswer,
        options,
        isUndefined: userAnswer === undefined,
        isNull: userAnswer === null,
        isEmpty: userAnswer === ''
      });

      // 首先检查是否为未作答状态
      if (userAnswer === undefined || userAnswer === null || userAnswer === '' || userAnswer === '未作答') {
        console.log('❌ 检测到未作答状态');
        return false;
      }

      // 对于判断题，使用选项索引比较
      if (questionType === 'true_false') {
        // 确保都是数字索引格式
        const userIndex = typeof userAnswer === 'number' ? userAnswer : 
                         (userAnswer === '正确' || userAnswer === 'true' || userAnswer === true) ? 0 : 1;
        const correctIndex = typeof correctAnswer === 'number' ? correctAnswer :
                           (correctAnswer === '正确' || correctAnswer === 'true' || correctAnswer === true) ? 0 : 1;
        
        console.log(`✅ 判断题比较: 用户选择索引${userIndex} vs 正确答案索引${correctIndex}`);
        return userIndex === correctIndex;
      }
      
      // 对于选择题，直接比较索引
      if (questionType === 'multiple_choice') {
        // 确保都是数字格式
        const userIndex = typeof userAnswer === 'number' ? userAnswer : parseInt(userAnswer);
        const correctIndex = typeof correctAnswer === 'number' ? correctAnswer : parseInt(correctAnswer);
        
        // 验证索引有效性
        if (isNaN(userIndex) || isNaN(correctIndex)) {
          console.log('❌ 答案索引无效');
          return false;
        }
        
        console.log(`✅ 选择题比较: 用户选择索引${userIndex} vs 正确答案索引${correctIndex}`);
        return userIndex === correctIndex;
      }
      
      // 默认情况下进行严格比较
      return userAnswer === correctAnswer;
    }

    // 评估答案
    const results = [];
    let totalScore = 0;
    let correctCount = 0;

    for (const answer of answers) {
      const question = session.questions.find(q => q.id === answer.questionId);
      if (!question) {
        console.log(`❌ 未找到题目 ID: ${answer.questionId}`);
        continue;
      }

      // 检查是否为未作答
      const isUnanswered = answer.selectedAnswer === undefined || 
                          answer.selectedAnswer === null || 
                          answer.selectedAnswer === '' || 
                          answer.selectedAnswer === '未作答';

      let isCorrect = false;
      let score = 0;
      let explanation = question.explanation || '暂无详细解释';

      if (isUnanswered) {
        // 未作答的情况
        isCorrect = false;
        score = 0;
        explanation = `未作答。正确答案是: ${getAnswerText(question.correctAnswer, question.options, question.type)}。${explanation}`;
        console.log(`❌ 题目${question.id}: 未作答`);
      } else {
        // 已作答的情况
        isCorrect = compareAnswers(
          answer.selectedAnswer, 
          question.correctAnswer, 
          question.type, 
          question.options
        );
        
        score = isCorrect ? 100 : 0;
        
        if (!isCorrect) {
          explanation = `回答错误。您的答案: ${getAnswerText(answer.selectedAnswer, question.options, question.type)}，正确答案: ${getAnswerText(question.correctAnswer, question.options, question.type)}。${explanation}`;
        } else {
          explanation = `回答正确！${explanation}`;
        }
        
        console.log(`${isCorrect ? '✅' : '❌'} 题目${question.id}: ${isCorrect ? '正确' : '错误'}`);
      }
      
      if (isCorrect) correctCount++;
      totalScore += score;

      results.push({
        questionId: answer.questionId,
        question: question.question,
        selectedAnswer: answer.selectedAnswer,
        correctAnswer: question.correctAnswer,
        correct: isCorrect,
        score: score,
        explanation: explanation,
        questionType: question.type,
        options: question.options,
        isUnanswered: isUnanswered,
        // 🏷️ 为标签测试添加来源文件信息
        sourceFiles: question.sourceFiles || question.isTagQuestion ? [session.tagName] : [session.fileName]
      });
    }

    const finalScore = Math.round(totalScore / answers.length);
    const accuracy = Math.round((correctCount / answers.length) * 100);

    // 更新会话状态
    session.status = 'completed';
    session.endTime = new Date().toISOString();
    session.results = {
      finalScore,
      accuracy,
      correctCount,
      totalQuestions: answers.length,
      unansweredCount: results.filter(r => r.isUnanswered).length,
      details: results
    };

    // 保存用户答案
    if (!global.userAnswers) {
      global.userAnswers = new Map();
    }
    global.userAnswers.set(sessionId, {
      userId: session.userId,
      sessionId,
      answers,
      results: session.results,
      submittedAt: new Date().toISOString()
    });

    const testTypeName = session.testType === 'tag_comprehensive' ? '标签综合测试' : '文件测试';
    const sourceName = session.tagName || session.fileName;    console.log(`✅ ${testTypeName}答案评估完成: ${sessionId}, 得分: ${finalScore}, 正确率: ${accuracy}%, 未作答: ${session.results.unansweredCount}题`);

    // 🔄 新增：发送WebSocket通知 - 测验完成
    try {
      webSocketService.notifyQuizStatus(session.userId, {
        type: 'quiz_completed',
        sessionId: sessionId,
        testType: session.testType,
        testTypeName: testTypeName,
        sourceName: sourceName,
        finalScore: finalScore,
        accuracy: accuracy,
        correctCount: correctCount,
        totalQuestions: answers.length,
        unansweredCount: session.results.unansweredCount,
        completedAt: session.endTime,
        completionTime: calculateCompletionTime(session.startTime, session.endTime)
      });
    } catch (wsError) {
      console.warn('WebSocket通知发送失败:', wsError);
    }

    res.json({
      success: true,
      data: {
        sessionId,
        finalScore,
        accuracy,
        correctCount,
        totalQuestions: answers.length,
        unansweredCount: session.results.unansweredCount,
        results: results,
        summary: {
          sourceName: sourceName,
          testType: session.testType,
          testTypeName: testTypeName,
          difficulty: session.difficulty,
          completionTime: calculateCompletionTime(session.startTime, session.endTime),
          // 🏷️ 为标签测试添加额外信息
          isTagTest: session.testType === 'tag_comprehensive',
          fileCount: session.fileCount || 1
        }
      },
      message: `${testTypeName}答案提交成功`
    });

  } catch (error) {
    console.error('❌ 答案提交失败:', error);
    res.status(500).json({
      success: false,
      message: '答案提交失败: ' + error.message
    });
  }
});

// 新增：获取答案文本的辅助函数
function getAnswerText(answerIndex, options, questionType) {
  if (answerIndex === undefined || answerIndex === null || answerIndex === '' || answerIndex === '未作答') {
    return '未作答';
  }
  
  if (questionType === 'true_false') {
    const index = typeof answerIndex === 'number' ? answerIndex : 
                  (answerIndex === '正确' || answerIndex === 'true' || answerIndex === true) ? 0 : 1;
    return ['正确', '错误'][index] || '未知';
  }
  
  if (questionType === 'multiple_choice') {
    const index = typeof answerIndex === 'number' ? answerIndex : parseInt(answerIndex);
    if (isNaN(index) || !options || index < 0 || index >= options.length) {
      return '未知选项';
    }
    return options[index];
  }
  
  return String(answerIndex);
}

// 获取测试结果
router.get('/results/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = quizSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: '测试会话不存在'
      });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: '测试尚未完成'
      });
    }

    res.json({
      success: true,
      data: {
        sessionId,
        ...session.results,
        summary: {
          fileName: session.fileName,
          testType: session.testType,
          difficulty: session.difficulty,
          startTime: session.startTime,
          endTime: session.endTime,
          completionTime: calculateCompletionTime(session.startTime, session.endTime)
        }
      }
    });

  } catch (error) {
    console.error('❌ 获取测试结果失败:', error);
    res.status(500).json({
      success: false,
      message: '获取测试结果失败'
    });
  }
});

// 获取用户测试历史
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userHistory = Array.from(quizSessions.values())
      .filter(session => session.userId === parseInt(userId))
      .map(session => ({
        sessionId: session.sessionId,
        fileName: session.fileName,
        testType: session.testType,
        difficulty: session.difficulty,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        finalScore: session.results?.finalScore,
        accuracy: session.results?.accuracy
      }))
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    res.json({
      success: true,
      data: userHistory,
      message: '获取测试历史成功'
    });

  } catch (error) {
    console.error('❌ 获取测试历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取测试历史失败'
    });
  }
});

// 计算完成时间
function calculateCompletionTime(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffInSeconds = Math.round((end - start) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds}秒`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    const seconds = diffInSeconds % 60;
    return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
  } else {
    const hours = Math.floor(diffInSeconds / 3600);
    const minutes = Math.floor((diffInSeconds % 3600) / 60);
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }
}

// 🔧 新增：DeepSeek API分析端点
router.post('/deepseek-analysis/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { analysisType = 'comprehensive', userId } = req.body;
    
    console.log(`🤖 DeepSeek分析请求: 文件${fileId}, 类型${analysisType}`);
    
    // 获取文件信息
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    if (!file.content) {
      return res.status(400).json({
        success: false,
        message: '文件内容为空，无法进行分析'
      });
    }
    
    // 检查DeepSeek服务
    const deepseekService = require('../utils/deepseekService');
    const isAvailable = await deepseekService.checkAvailability();
    
    if (!isAvailable) {
      return res.status(503).json({
        success: false,
        message: 'DeepSeek API服务不可用，请检查API密钥配置'
      });
    }
    
    // 执行DeepSeek分析
    const analysisResult = await deepseekService.analyzeContent(
      file.content,
      file.originalName,
      analysisType
    );
    
    // 保存分析结果到文件记录
    file.deepseekAnalysis = {
      ...file.deepseekAnalysis,
      [analysisType]: analysisResult
    };
    
    // 更新数据库记录
    try {
      const database = require('../database/database');
      database.files.updateFile(fileId, {
        deepseekAnalysis: JSON.stringify(file.deepseekAnalysis)
      });
      console.log(`💾 DeepSeek分析结果已保存到数据库`);
    } catch (dbError) {
      console.warn('⚠️ 保存DeepSeek分析结果到数据库失败:', dbError);
    }
    
    res.json({
      success: true,
      message: 'DeepSeek分析完成',
      data: {
        fileId: fileId,
        fileName: file.originalName,
        analysisType: analysisType,
        result: analysisResult,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ DeepSeek分析失败:', error);
    res.status(500).json({
      success: false,
      message: 'DeepSeek分析失败',
      error: error.message
    });
  }
});

// 🔧 新增：获取文件的DeepSeek分析历史
router.get('/deepseek-analysis/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    const deepseekAnalysis = file.deepseekAnalysis || {};
    
    res.json({
      success: true,
      data: {
        fileId: fileId,
        fileName: file.originalName,
        analysisHistory: deepseekAnalysis,
        availableTypes: Object.keys(deepseekAnalysis),
        hasAnalysis: Object.keys(deepseekAnalysis).length > 0
      }
    });
    
  } catch (error) {
    console.error('❌ 获取DeepSeek分析历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取分析历史失败',
      error: error.message
    });
  }
});

// 🔧 新增：批量DeepSeek分析端点
router.post('/batch-deepseek-analysis', async (req, res) => {
  try {
    const { fileIds, analysisType = 'comprehensive', userId } = req.body;
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要分析的文件ID列表'
      });
    }
    
    console.log(`🔄 批量DeepSeek分析: ${fileIds.length}个文件, 类型${analysisType}`);
    
    const results = [];
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    const deepseekService = require('../utils/deepseekService');
    
    // 检查服务可用性
    const isAvailable = await deepseekService.checkAvailability();
    if (!isAvailable) {
      return res.status(503).json({
        success: false,
        message: 'DeepSeek API服务不可用'
      });
    }
    
    // 逐个处理文件
    for (const fileId of fileIds) {
      try {
        const file = fileDatabase.find(f => f.id === fileId);
        if (!file || !file.content) {
          results.push({
            fileId,
            success: false,
            error: '文件不存在或内容为空'
          });
          continue;
        }
        
        const analysisResult = await deepseekService.analyzeContent(
          file.content,
          file.originalName,
          analysisType
        );
        
        // 保存结果
        file.deepseekAnalysis = {
          ...file.deepseekAnalysis,
          [analysisType]: analysisResult
        };
        
        results.push({
          fileId,
          fileName: file.originalName,
          success: true,
          data: analysisResult
        });
        
      } catch (error) {
        console.error(`❌ 文件${fileId}分析失败:`, error.message);
        results.push({
          fileId,
          fileName: fileDatabase.find(f => f.id === fileId)?.originalName || '未知',
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `批量分析完成，成功${results.filter(r => r.success).length}个，失败${results.filter(r => !r.success).length}个`,
      data: {
        total: fileIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      }
    });
    
  } catch (error) {
    console.error('❌ 批量DeepSeek分析失败:', error);
    res.status(500).json({
      success: false,
      message: '批量分析失败',
      error: error.message
    });
  }
});

// 🔧 新增：检查DeepSeek API状态端点
router.get('/deepseek-status', async (req, res) => {
  try {
    const deepseekService = require('../utils/deepseekService');
    
    // 检查AI总开关
    const aiEnabled = process.env.AI_ENABLED !== 'false';
    if (!aiEnabled) {
      return res.json({
        success: true,
        available: false,
        aiEnabled: false,
        deepseekEnabled: false,
        message: 'AI功能已禁用'
      });
    }

    // 检查DeepSeek功能开关
    const deepseekEnabled = deepseekService.isDeepSeekEnabled();
    if (!deepseekEnabled) {
      return res.json({
        success: true,
        available: false,
        aiEnabled: true,
        deepseekEnabled: false,
        message: 'DeepSeek功能已禁用'
      });
    }

    // 检查API可用性
    const isAvailable = await deepseekService.checkAvailability();
    
    res.json({
      success: true,
      available: isAvailable,
      aiEnabled: true,
      deepseekEnabled: true,
      message: isAvailable ? 'DeepSeek API可用' : 'DeepSeek API不可用'
    });
    
  } catch (error) {
    console.error('❌ DeepSeek状态检查失败:', error);
    res.json({
      success: false,
      available: false,
      aiEnabled: true,
      deepseekEnabled: true,
      message: 'DeepSeek API检查失败',
      error: error.message
    });
  }
});

// 🔧 新增：本地模型单文件分析端点
router.post('/analyze/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { analysisType = 'comprehensive', userId } = req.body;
    
    console.log(`🤖 本地模型分析请求: 文件${fileId}, 类型${analysisType}`);
    
    // 获取文件信息
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    const file = fileDatabase.find(f => f.id === fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
    
    if (!file.content) {
      return res.status(400).json({
        success: false,
        message: '文件内容为空，无法进行分析'
      });
    }
    
    // 使用本地AI服务进行分析
    const aiService = require('../utils/aiService');
    const analysisResult = await aiService.analyzeDocumentContent(
      file.content,
      file.originalName,
      analysisType
    );
    
    // 保存分析结果（可选，根据需要实现）
    file.localAnalysisResult = {
      ...analysisResult,
      analysisType,
      analyzedAt: new Date().toISOString(),
      userId
    };
    
    res.json({
      success: true,
      message: '本地模型分析完成',
      data: analysisResult
    });
    
  } catch (error) {
    console.error('❌ 本地模型分析失败:', error);
    res.status(500).json({
      success: false,
      message: '本地模型分析失败',
      error: error.message
    });
  }
});

// 🔧 新增：本地模型批量分析端点
router.post('/batch-analyze', async (req, res) => {
  try {
    const { fileIds, analysisType = 'comprehensive', userId } = req.body;
    
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的文件ID列表'
      });
    }
    
    console.log(`🔄 开始批量本地模型分析: ${fileIds.length}个文件`);
    
    // 获取文件信息
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    const results = [];
    
    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];
      try {
        console.log(`📊 分析进度: ${i + 1}/${fileIds.length} - 文件${fileId}`);
        
        const file = fileDatabase.find(f => f.id === fileId);
        if (!file) {
          results.push({
            fileId,
            fileName: '未知',
            success: false,
            error: '文件不存在'
          });
          continue;
        }
        
        if (!file.content) {
          results.push({
            fileId,
            fileName: file.originalName,
            success: false,
            error: '文件内容为空'
          });
          continue;
        }
        
        // 使用本地AI服务进行分析
        const aiService = require('../utils/aiService');
        const analysisResult = await aiService.analyzeDocumentContent(
          file.content,
          file.originalName,
          analysisType
        );
        
        // 保存分析结果
        file.localAnalysisResult = {
          ...analysisResult,
          analysisType,
          analyzedAt: new Date().toISOString(),
          userId
        };
        
        results.push({
          fileId,
          fileName: file.originalName,
          success: true,
          data: analysisResult
        });
        
      } catch (error) {
        console.error(`❌ 文件${fileId}分析失败:`, error);
        results.push({
          fileId,
          fileName: fileDatabase.find(f => f.id === fileId)?.originalName || '未知',
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `批量分析完成，成功${results.filter(r => r.success).length}个，失败${results.filter(r => !r.success).length}个`,
      data: {
        total: fileIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      }
    });
    
  } catch (error) {
    console.error('❌ 批量本地模型分析失败:', error);
    res.status(500).json({
      success: false,
      message: '批量分析失败',
      error: error.message
    });
  }
});

module.exports = router;
