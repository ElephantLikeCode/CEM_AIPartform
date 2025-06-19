const express = require('express');
const router = express.Router();
const aiService = require('../utils/aiService');
const path = require('path');
const ragService = require('../utils/ragService'); // 🔧 新增：RAG服务

// 改进的文件名解码处理函数
const normalizeFileName = (fileName) => {
  if (!fileName) return fileName;
  
  try {
    // 如果已经是正确的中文，直接返回
    if (/[\u4e00-\u9fa5]/.test(fileName) && !fileName.includes('�')) {
      return fileName;
    }
    
    // 尝试多种解码方式
    const methods = [
      () => fileName,
      () => decodeURIComponent(fileName),
      () => Buffer.from(fileName, 'latin1').toString('utf8'),
      () => Buffer.from(fileName, 'binary').toString('utf8')
    ];
    
    for (const method of methods) {
      try {
        const result = method();
        if (result && /[\u4e00-\u9fa5]/.test(result) && !result.includes('�')) {
          return result;
        }
      } catch (e) {
        continue;
      }
    }
    
    return fileName;
  } catch (error) {
    return fileName;
  }
};

// 检查AI服务状态
router.get('/health', async (req, res) => {
  try {
    const isAvailable = await aiService.checkModelAvailability();
    res.json({
      success: true,
      data: {
        aiService: isAvailable ? 'ready' : 'unavailable',
        model: aiService.model,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'AI健康检查失败',
      error: error.message
    });
  }
});

// 智能学习对话 - 基于当前学习上下文
router.post('/chat', async (req, res) => {
  try {
    const { question, userId, context, stage } = req.body;
    
    console.log('🤖 收到AI对话请求:', {
      userId,
      questionLength: question?.length,
      hasContext: !!context,
      stage
    });

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '问题不能为空'
      });
    }

    // 🔧 新增：使用RAG增强回答
    const ragResponse = await ragService.generateRAGResponse(question, context);

    console.log('✅ RAG增强回答生成成功:', {
      responseLength: ragResponse.response.length,
      relevantChunks: ragResponse.relevantChunks
    });

    res.json({
      success: true,
      data: {
        response: ragResponse.response,
        timestamp: ragResponse.timestamp,
        relevantChunks: ragResponse.relevantChunks,
        ragEnhanced: true
      }
    });

  } catch (error) {
    console.error('❌ AI对话失败:', error);
    
    // 🔧 RAG失败时的降级处理
    try {
      console.log('🔄 RAG失败，使用基础AI回答...');      // 构建基础prompt
      let basicPrompt = `用户问题：${req.body.question}\n\n`;
      
      // 🔧 修复：正确处理context对象，避免[object Object]问题
      if (req.body.context) {
        let contextText = '';
        
        if (typeof req.body.context === 'string') {
          contextText = req.body.context;
        } else if (typeof req.body.context === 'object') {
          // 将context对象转换为可读的文本格式
          const parts = [];
          if (req.body.context.learningType) parts.push(`学习类型: ${req.body.context.learningType}`);
          if (req.body.context.fileName) parts.push(`文件: ${req.body.context.fileName}`);
          if (req.body.context.tagName) parts.push(`标签: ${req.body.context.tagName}`);
          if (req.body.context.currentStage && req.body.context.totalStages) {
            parts.push(`当前学习阶段: ${req.body.context.currentStage}/${req.body.context.totalStages}`);
          }
          if (req.body.context.stageTitle) parts.push(`阶段标题: ${req.body.context.stageTitle}`);
          if (req.body.context.stageContent) {
            const contentPreview = typeof req.body.context.stageContent === 'string' 
              ? req.body.context.stageContent.substring(0, 300) + (req.body.context.stageContent.length > 300 ? '...' : '')
              : '学习内容概要';
            parts.push(`学习内容: ${contentPreview}`);
          }
          if (req.body.context.keyPoints && Array.isArray(req.body.context.keyPoints)) {
            parts.push(`关键点: ${req.body.context.keyPoints.slice(0, 3).join(', ')}`);
          }
          
          contextText = parts.length > 0 ? parts.join('\n') : '当前学习内容';
        }
        
        basicPrompt += `学习上下文：\n${contextText}\n\n`;
      }
      
      basicPrompt += `请作为AI学习助手回答用户的问题。回答要准确、有帮助，并与学习内容相关。`;

      // 🔧 使用队列化的AI请求
      const response = await aiService.queuedAIRequest(async () => {
        return await aiService.ollama.chat({
          model: aiService.model,
          messages: [{ role: 'user', content: basicPrompt }],
          stream: false,
          options: {
            temperature: 0.3,
            num_ctx: 4096,
            num_predict: 800
          }
        });
      }, 'AI基础对话');

      res.json({
        success: true,
        data: {
          response: response.message.content.trim(),
          timestamp: new Date().toISOString(),
          relevantChunks: 0,
          ragEnhanced: false,
          fallback: true
        }
      });

    } catch (fallbackError) {
      console.error('❌ 基础AI回答也失败:', fallbackError);
      
      res.status(500).json({
        success: false,
        message: 'AI服务暂时不可用，请稍后重试',
        error: error.message
      });
    }
  }
});

// 生成学习建议
router.post('/suggest', async (req, res) => {
  try {
    const { userId, currentStage, difficulty } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 从learning模块获取学习统计
    try {
      const learningModule = require('./learning');
      
      if (learningModule.learningProgress && learningModule.learningProgress[userId]) {
        const progress = learningModule.learningProgress[userId];
        
        // 计算学习统计
        const completionRate = Math.round((progress.current_stage / progress.total_stages) * 100);
        const timeSpent = progress.lastUpdated ? 
          Math.round((new Date(progress.lastUpdated).getTime() - new Date(progress.startedAt).getTime()) / (1000 * 60)) : 0;
        
        const suggestions = await aiService.generateLearningSuggestions(
          completionRate,
          timeSpent,
          progress.learningContent?.difficulty || difficulty || '中级',
          progress.learningContent?.topics || ['学习内容']
        );
        
        res.json({
          success: true,
          data: {
            suggestions,
            stats: {
              completionRate,
              timeSpent,
              difficulty: progress.learningContent?.difficulty || '中级',
              currentStage: progress.current_stage,
              totalStages: progress.total_stages
            }
          }
        });
      } else {
        throw new Error('无法获取学习统计');
      }
    } catch (error) {
      console.log('获取学习统计失败，返回通用建议:', error.message);
      
      // 返回通用建议
      res.json({
        success: true,
        data: {
          suggestions: [
            "保持定期学习，每天至少投入30分钟",
            "遇到难点时，不要急于跳过，可以向AI助手提问",
            "完成每个阶段后，回顾关键要点加深理解",
            "结合实践应用，巩固所学知识",
            "制定明确的学习目标和计划",
            "适当休息，避免学习疲劳"
          ],
          stats: null
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '生成学习建议失败',
      error: error.message
    });
  }
});

// 生成测试题目 - 简化版本，移除备用机制
router.post('/generate-questions', async (req, res) => {
  try {
    const { userId, stage, difficulty, questionCount = 5, fileName, stageTitle, model = 'local' } = req.body;
    
    // 处理中文文件名编码
    const decodedFileName = fileName ? normalizeFileName(fileName) : null;
    
    console.log('📝 题目生成请求:', { userId, stage, difficulty, questionCount, fileName: decodedFileName, model });

    // 检查AI服务可用性
    const aiAvailable = await aiService.checkModelAvailability();
    if (!aiAvailable) {
      return res.status(503).json({
        success: false,
        message: 'AI服务不可用，无法生成题目',
        error: '请确保Ollama运行正常并已加载模型'
      });
    }

    // 获取学习内容
    let stageContent = '';
    let context = {
      fileName: decodedFileName || "学习材料",
      stage: stage || 1,
      stageTitle: stageTitle || "当前阶段"
    };

    try {
      const uploadModule = require('./upload');
      const { fileDatabase } = uploadModule;
      
      if (fileDatabase && fileDatabase.length > 0) {
        console.log(`📚 文件数据库中有 ${fileDatabase.length} 个文件`);
        
        const completedFiles = fileDatabase.filter(f => 
          f.status === 'completed' && 
          f.aiAnalysis && 
          f.aiAnalysis.learningStages
        );
        
        console.log(`📊 找到 ${completedFiles.length} 个已分析的文件`);
        
        if (completedFiles.length > 0) {
          let targetFile = completedFiles.find(f => {
            // 规范化文件名进行比较
            const normalizedOriginalName = normalizeFileName(f.originalName);
            return decodedFileName && normalizedOriginalName.toLowerCase().includes(decodedFileName.toLowerCase());
          }) || completedFiles[completedFiles.length - 1];
          
          console.log(`🎯 使用文件: ${normalizeFileName(targetFile.originalName)}`);
          
          const targetStage = targetFile.aiAnalysis.learningStages.find(
            s => s.stage === parseInt(stage)
          ) || targetFile.aiAnalysis.learningStages[0];
          
          if (targetStage) {
            stageContent = targetStage.content;
            context = {
              fileName: normalizeFileName(targetFile.originalName),
              stage: targetStage.stage,
              stageTitle: targetStage.title
            };
            console.log(`✅ 找到阶段内容: ${targetStage.title}`);
          }
        }
      }
      
      if (!stageContent || stageContent.length < 50) {
        throw new Error('未找到足够的学习内容用于生成题目');
      }
      
    } catch (error) {
      console.error('❌ 获取学习内容失败:', error.message);
      return res.status(400).json({
        success: false,
        message: '获取学习内容失败: ' + error.message
      });
    }

    console.log('🔍 题目生成上下文:', { context, contentLength: stageContent.length });    // 调用AI生成题目 - 直接抛出错误，不使用备用
    const questions = await aiService.generateQuestions(
      stageContent,
      stage || 1,
      difficulty || '中级',
      questionCount,
      model // 🤖 传递模型选择
    );
    
    console.log('✅ AI题目生成成功，数量:', questions.questions.length);
    
    return res.json({
      success: true,
      data: {
        questions: questions.questions,
        context: context,
        contentSource: 'ai_generated'
      }
    });
      
  } catch (error) {
    console.error('❌ 题目生成失败:', error);
    
    // 直接返回错误，不提供备用题目
    res.status(500).json({
      success: false,
      message: '题目生成失败: ' + error.message,
      error: error.message,
      details: {
        suggestion: '请检查AI服务状态、学习内容质量或稍后重试',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// 评估学习答案
router.post('/evaluate-answer', async (req, res) => {
  try {
    const { question, userAnswer, correctAnswer, context } = req.body;
    
    if (!question || userAnswer === undefined) {
      return res.status(400).json({
        success: false,
        message: '题目和用户答案不能为空'
      });
    }

    const evaluation = await aiService.evaluateAnswer(
      question,
      userAnswer,
      correctAnswer,
      context
    );
    
    res.json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '答案评估失败',
      error: error.message
    });
  }
});

// 🔧 新增：支持模型选择的AI聊天端点
router.post('/chat-with-model', async (req, res) => {
  try {
    const { question, userId, context, stage, model = 'local' } = req.body;    
    console.log(`🤖 收到AI聊天请求 (模型: ${model})`);
    console.log('📋 问题:', question);
    console.log('👤 用户ID:', userId);
    console.log('📝 上下文长度:', context ? context.length : 0);
    console.log('📊 阶段:', stage);

    if (!question) {
      return res.status(400).json({
        success: false,
        message: '问题不能为空'
      });
    }

    // 检查AI总开关
    const aiEnabled = process.env.AI_ENABLED !== 'false';
    if (!aiEnabled) {
      return res.status(503).json({
        success: false,
        message: 'AI功能已禁用，请联系管理员启用'
      });
    }

    let response;
    
    if (model === 'deepseek') {
      // 使用DeepSeek API
      const deepseekService = require('../utils/deepseekService');
      
      // 检查DeepSeek功能开关
      if (!deepseekService.isDeepSeekEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'DeepSeek功能已禁用，请使用本地模型'
        });
      }
      
      // 检查DeepSeek可用性
      const isAvailable = await deepseekService.checkAvailability();
      if (!isAvailable) {
        return res.status(503).json({
          success: false,
          message: 'DeepSeek API不可用，请检查配置或使用本地模型'
        });
      }
        // 使用DeepSeek进行问答
      // 🔧 修复：正确处理context对象，避免[object Object]问题
      let contextText = '无特定上下文';
      
      if (context) {
        if (typeof context === 'string') {
          contextText = context;
        } else if (typeof context === 'object') {
          // 将context对象转换为可读的文本格式
          const parts = [];
          if (context.learningType) parts.push(`学习类型: ${context.learningType}`);
          if (context.fileName) parts.push(`文件: ${context.fileName}`);
          if (context.tagName) parts.push(`标签: ${context.tagName}`);
          if (context.currentStage && context.totalStages) {
            parts.push(`当前学习阶段: ${context.currentStage}/${context.totalStages}`);
          }
          if (context.stageTitle) parts.push(`阶段标题: ${context.stageTitle}`);
          if (context.stageContent) {
            const contentPreview = typeof context.stageContent === 'string' 
              ? context.stageContent.substring(0, 500) + (context.stageContent.length > 500 ? '...' : '')
              : '学习内容概要';
            parts.push(`学习内容: ${contentPreview}`);
          }
          if (context.keyPoints && Array.isArray(context.keyPoints)) {
            parts.push(`关键点: ${context.keyPoints.slice(0, 3).join(', ')}`);
          }
          
          contextText = parts.length > 0 ? parts.join('\n') : '当前学习内容';
        }
      }
      
      const chatPrompt = `作为AI学习助手，请回答学生的问题。

学习上下文：
${contextText}

学生问题：${question}

请提供准确、详细且有教育意义的回答，帮助学生理解相关概念。`;

      response = await deepseekService.chat(chatPrompt);
      
    } else {
      // 使用本地模型和RAG
      console.log('🔍 使用本地模型和RAG系统');
      
      // 使用RAG增强的AI服务
      response = await ragService.processQuestion(question, {
        userId,
        context,
        stage
      });
    }

    const timestamp = new Date().toISOString();
    
    console.log('✅ AI聊天完成');
    
    res.json({
      success: true,
      message: 'AI对话成功',
      data: {
        response: response.answer || response,
        timestamp: timestamp,
        model: model,
        ragEnhanced: response.ragEnhanced || false,
        relevantChunks: response.relevantChunks || [],
        fallback: response.fallback || false
      }
    });

  } catch (error) {
    console.error('❌ AI聊天失败:', error);
    res.status(500).json({
      success: false,
      message: 'AI对话失败',
      error: error.message
    });
  }
});

module.exports = router;
