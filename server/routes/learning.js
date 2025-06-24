const express = require('express');
const router = express.Router();
const database = require('../database/database'); // 🏷️ 新增：数据库操作
const ragService = require('../utils/ragService'); // 🔧 新增：RAG服务
const webSocketService = require('../utils/websocketServiceStub'); // 🔄 临时：WebSocket桩服务
const { requireAuth, requireAdmin } = require('../middleware/auth');

// 获取文件数据库 - 从upload模块导入
let fileDatabase = [];

// 模拟学习进度数据库
let learningProgress = {};

// 🔒 新增：用户会话管理
let userSessions = new Map(); // userId -> { sessionId, lastActivity, learningState }

// Tag-based learning has been removed - only per-document learning is supported

// Tag-based learning endpoints have been removed

// 🔧 修复：获取可用学习材料 - 确保返回正确的数据结构，加入权限控制
router.get('/materials', requireAuth, async (req, res) => {
  try {
    console.log('📚 获取可用学习材料...');
    
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'sub_admin';
    
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    if (!fileDatabase || !Array.isArray(fileDatabase)) {
      console.log('⚠️ 文件数据库为空或不存在');
      return res.json({
        success: true,
        data: [],
        message: '暂无可用的学习材料'
      });
    }
    
    console.log(`📋 文件数据库中共有 ${fileDatabase.length} 个文件`);
      // 权限控制：非管理员只能看到分配给自己的文件
    let accessibleFiles = fileDatabase;
    if (!isAdmin) {
      const visibleFileIds = database.fileVisibility.getVisibleFileIdsForUser(userId);
      console.log(`🔍 用户${userId}权限检查 - 可见文件IDs:`, visibleFileIds);
      console.log(`🔍 权限ID类型检查:`, visibleFileIds.map(id => typeof id));
      console.log(`🔍 文件数据库中的文件IDs:`, fileDatabase.map(f => ({ id: f.id, type: typeof f.id })));
      
      // 确保类型一致的比较
      accessibleFiles = fileDatabase.filter(file => {
        const hasPermission = visibleFileIds.some(id => String(id) === String(file.id));
        console.log(`🔍 文件${file.id}(${file.originalName}) 权限检查: ${hasPermission}`);
        return hasPermission;
      });
      console.log(`🔒 用户${userId}可访问的文件: ${accessibleFiles.length}/${fileDatabase.length}`);
    }
    
    // �🔧 增强过滤逻辑，输出详细的过滤信息
    const availableMaterials = accessibleFiles
      .filter(file => {
        console.log(`🔍 检查文件: ${file?.originalName || 'unknown'}`);
        
        if (!file) {
          console.log(`  ❌ 文件对象为空`);
          return false;
        }
        
        if (file.status !== 'completed') {
          console.log(`  ❌ 文件状态不符合: ${file.status}`);
          return false;
        }
        
        if (!file.content || file.content.trim().length === 0) {
          console.log(`  ❌ 文件没有内容`);
          return false;
        }
        
        if (!file.aiAnalysis) {
          console.log(`  ❌ 文件没有AI分析`);
          return false;
        }
        
        if (!file.aiAnalysis.learningStages || file.aiAnalysis.learningStages.length === 0) {
          console.log(`  ❌ 文件没有学习阶段`);
          return false;
        }
        
        console.log(`  ✅ 文件检查通过`);
        return true;
      })      .map(file => {
        const analysis = file.aiAnalysis || {};
        
        // 🔧 检查学习权限和前置要求
        const canUserLearn = isAdmin || database.learningProgress.canUserLearnFile(userId, file.id);
        
        // 🔧 获取文件的标签和顺序信息
        const fileTagsInfo = database.tags.getFileTags(file.id);
        let prerequisiteInfo = null;
        let orderInfo = null;
        
        if (fileTagsInfo.length > 0) {
          // 获取文件在标签中的顺序信息
          try {
            const tagId = fileTagsInfo[0].id; // 取第一个标签
            const tagFiles = database.tagFileOrder.getFilesByTagOrdered(tagId);
            const currentFileIndex = tagFiles.findIndex(f => String(f.id) === String(file.id));
            
            if (currentFileIndex > 0) {
              const previousFile = tagFiles[currentFileIndex - 1];
              prerequisiteInfo = {
                hasPrerequisite: true,
                prerequisiteFile: {
                  id: previousFile.id,
                  name: previousFile.original_name,
                  order: currentFileIndex
                },
                tagName: fileTagsInfo[0].name
              };
            }
            
            orderInfo = {
              tagName: fileTagsInfo[0].name,
              currentOrder: currentFileIndex + 1,
              totalFiles: tagFiles.length,
              isFirst: currentFileIndex === 0,
              isLast: currentFileIndex === tagFiles.length - 1
            };
          } catch (error) {
            console.warn(`获取文件 ${file.id} 顺序信息失败:`, error);
          }
        }
        
        // 🔧 确保返回完整的数据结构
        const material = {
          id: file.id,
          name: file.originalName,
          summary: analysis.summary || `学习文档：${file.originalName}`,
          stages: analysis.learningStages?.length || 1,
          keyPoints: analysis.keyPoints?.length || 0,
          uploadTime: file.uploadTime || file.createdAt,
          uploadTimestamp: file.uploadTimestamp || file.createdAt,
          fileType: file.fileType,
          size: file.fileSize || 0,
          status: file.status,
          hasAIResults: !!file.aiAnalysis,
          aiSummary: analysis.summary,
          topics: analysis.topics || ['学习内容'],
          relativeTime: file.relativeTime,
          canLearn: canUserLearn,
          learningReady: true,
          contentLength: file.content?.length || 0,
          hasContent: !!file.content,
          tags: fileTagsInfo,
          prerequisiteInfo,
          orderInfo
        };
        
        console.log(`📄 处理材料: ${material.name} - ID: ${material.id} - 阶段数: ${material.stages} - 可学习: ${material.canLearn}`);
        return material;
      })
      .sort((a, b) => {
        const timeA = a.uploadTimestamp || new Date(a.uploadTime).getTime() || 0;
        const timeB = b.uploadTimestamp || new Date(b.uploadTime).getTime() || 0;
        return timeB - timeA;
      });
    
    console.log(`📋 找到 ${availableMaterials.length} 个可用学习材料（总文件数: ${fileDatabase.length}）`);
    
    // 🔧 输出详细的材料列表
    if (availableMaterials.length > 0) {
      console.log('✅ 可用学习材料列表:');
      availableMaterials.forEach((material, index) => {
        console.log(`  ${index + 1}. ${material.name} (ID: ${material.id}, 阶段: ${material.stages})`);
      });
    } else {
      console.log('❌ 没有找到任何可用的学习材料');
      console.log('📊 文件状态统计:');
      const statusCount = {};
      fileDatabase.forEach(file => {
        const status = file?.status || 'unknown';
        statusCount[status] = (statusCount[status] || 0) + 1;
      });
      console.log('   状态分布:', statusCount);
      
      console.log('📊 AI分析状态统计:');
      const aiCount = {
        hasAI: 0,
        noAI: 0,
        hasStages: 0,
        noStages: 0,
        hasContent: 0,
        noContent: 0
      };
      fileDatabase.forEach(file => {
        if (file?.aiAnalysis) aiCount.hasAI++;
        else aiCount.noAI++;
        
        if (file?.aiAnalysis?.learningStages?.length > 0) aiCount.hasStages++;
        else aiCount.noStages++;
        
        if (file?.content && file.content.trim().length > 0) aiCount.hasContent++;
        else aiCount.noContent++;
      });
      console.log('   AI分析分布:', aiCount);
    }
    
    res.json({
      success: true,
      data: availableMaterials,
      total: availableMaterials.length,
      debug: {
        totalFiles: fileDatabase.length,
        availableCount: availableMaterials.length,
        timestamp: new Date().toISOString()
      },
      message: availableMaterials.length > 0 ? 
        `找到 ${availableMaterials.length} 个可用学习材料` : 
        '暂无可用的学习材料，请等待文件AI分析完成'
    });
  } catch (error) {
    console.error('❌ 获取学习材料失败:', error);
    res.status(500).json({
      success: false,
      message: '获取学习材料失败: ' + error.message,
      error: error.message
    });
  }
});

// 开始学习 - 🔧 让AI智能决定学习阶段划分，并添加前置条件检查
router.post('/start', requireAuth, async (req, res) => {
  try {
    const { userId, fileId } = req.body;
    
    console.log('🚀 开始单文件学习:', { userId, fileId });
    
    if (!userId || !fileId) {
      return res.status(400).json({
        success: false,
        message: '用户ID和文件ID不能为空'
      });
    }
    
    const userIdInt = parseInt(userId);
    if (isNaN(userIdInt)) {
      return res.status(400).json({
        success: false,
        message: '用户ID必须是有效的数字'
      });
    }

    // 🔧 新增：检查用户是否有权限学习该文件
    const canLearn = database.canUserLearnFile(userIdInt, fileId);
    if (!canLearn) {
      console.log(`❌ 用户${userIdInt}不能学习文件${fileId} - 前置条件未满足`);
      return res.status(403).json({
        success: false,
        message: '您必须先完成前一个文件的学习并通过测试（分数≥80）才能学习此文件',
        code: 'PREREQUISITE_NOT_MET'
      });
    }
    
    // 获取文件数据库
    const uploadModule = require('./upload');
    const selectedFile = uploadModule.fileDatabase.find(f => f.id === fileId);
    
    if (!selectedFile) {
      console.log(`❌ 文件不存在: ${fileId}`);
      return res.status(404).json({
        success: false,
        message: '指定的学习材料不存在'
      });
    }
    
    console.log(`📁 找到文件: ${selectedFile.originalName}, 状态: ${selectedFile.status}`);
    
    if (selectedFile.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: '该文件尚未完成分析，无法开始学习',
        details: {
          currentStatus: selectedFile.status,
          fileName: selectedFile.originalName
        }
      });
    }
    
    if (!selectedFile.content) {
      return res.status(400).json({
        success: false,
        message: '该文件没有内容，无法开始学习'
      });
    }
    
    // 🔧 改进：如果没有AI分析或学习阶段，重新进行AI分析
    if (!selectedFile.aiAnalysis || !selectedFile.aiAnalysis.learningStages || selectedFile.aiAnalysis.learningStages.length === 0) {
      console.log(`🤖 文件 ${selectedFile.originalName} 需要重新进行AI智能分析...`);
      
      try {
        // 使用改进的AI分析服务
        const aiService = require('../utils/aiService');
        const analysis = await aiService.analyzeContent(selectedFile.content, selectedFile.originalName);
        
        selectedFile.aiAnalysis = analysis;
        
        // 同步更新到数据库
        try {
          const database = require('../database/database');
          database.files.updateFile(selectedFile.id, {
            aiAnalysis: selectedFile.aiAnalysis
          });
          console.log(`💾 已更新文件 ${selectedFile.originalName} 的AI分析到数据库`);
        } catch (dbError) {
          console.warn('同步AI分析到数据库失败:', dbError);
        }
        
        console.log(`✅ AI智能分析完成，生成 ${analysis.learningStages.length} 个学习阶段`);
      } catch (analysisError) {
        console.error('❌ AI分析失败:', analysisError);
        return res.status(500).json({
          success: false,
          message: '文件AI分析失败，无法开始学习',
          error: analysisError.message
        });
      }
    }
    
    const learningStages = selectedFile.aiAnalysis.learningStages;
    
    if (!learningStages || learningStages.length === 0) {
      return res.status(500).json({
        success: false,
        message: '无法为该文件生成学习阶段'
      });
    }
    
    // 构建学习内容
    const learningContent = {
      fileId: selectedFile.id,
      fileName: selectedFile.originalName,
      totalStages: learningStages.length,
      summary: selectedFile.aiAnalysis.summary || `学习《${selectedFile.originalName}》的核心内容`,
      topics: selectedFile.aiAnalysis.topics || ['文档学习'],
      originalContent: selectedFile.content,
      analysisMetadata: selectedFile.aiAnalysis.analysisMetadata,
      stages: learningStages.map((stage, index) => ({
        stage: stage.stage || (index + 1),
        title: stage.title || `第${index + 1}阶段 - ${selectedFile.originalName}`,
        content: stage.content || '学习内容',
        keyPoints: stage.keyPoints || [`第${index + 1}阶段学习要点`],
        fileName: selectedFile.originalName,
        totalStages: learningStages.length,
        topics: selectedFile.aiAnalysis.topics || ['文档学习'],
        contentSection: stage.contentSection || `第${index + 1}部分内容`
      }))
    };
      // 保存学习进度
    learningProgress[userIdInt] = {
      id: userIdInt,
      fileId: selectedFile.id,
      learningType: 'file',
      current_stage: 1,
      total_stages: learningContent.totalStages,
      completed: false,
      startedAt: new Date().toISOString(),
      learningContent: learningContent,
      fileName: selectedFile.originalName
    };
    
    // 🔄 新增：发送WebSocket通知 - 文件学习开始
    try {
      webSocketService.notifyLearningProgress(userIdInt, {
        type: 'file_learning_started',
        fileId: selectedFile.id,
        fileName: selectedFile.originalName,
        currentStage: 1,
        totalStages: learningContent.totalStages,
        startedAt: new Date().toISOString()
      });
    } catch (wsError) {
      console.warn('WebSocket通知发送失败:', wsError);
    }
    
    console.log(`✅ 用户 ${userIdInt} 开始学习文件: ${selectedFile.originalName}, 共${learningContent.totalStages}个阶段`);
    
    res.json({
      success: true,
      totalStages: learningContent.totalStages,
      currentStage: 1,
      fileName: selectedFile.originalName,
      message: `开始学习《${selectedFile.originalName}》！AI智能分析生成${learningContent.totalStages}个学习阶段`,
      contentInfo: {
        aiGenerated: true,
        hasIntelligentStages: true,
        contentLength: selectedFile.content?.length || 0,
        stagesCreated: learningContent.totalStages,
        analysisMethod: selectedFile.aiAnalysis.analysisMetadata?.aiGenerated ? 'AI智能分析' : '基础分析'
      }
    });
  } catch (error) {
    console.error('❌ 开始学习失败:', error);
    res.status(500).json({
      success: false,
      message: '开始学习失败',
      error: error.message
    });
  }
});

// 获取特定阶段内容 - 🔧 移除难度相关逻辑
router.get('/stage/:userId/:stage', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const stage = parseInt(req.params.stage);
    
    console.log(`📖 获取阶段内容 - 用户${userId}, 阶段${stage}`);
    
    const progress = learningProgress[userId];
    if (!progress) {
      console.log(`❌ 用户${userId}未找到学习进度`);
      return res.status(404).json({
        success: false,
        message: '未找到学习进度，请先开始学习'
      });
    }
    
    console.log(`📋 用户${userId}学习进度:`, {
      type: progress.learningType,
      current_stage: progress.current_stage,
      total_stages: progress.total_stages,
      stages_count: progress.learningContent?.stages?.length || 0
    });
    
    // 验证阶段号
    if (stage < 1 || stage > progress.total_stages) {
      return res.status(400).json({
        success: false,
        message: `无效的阶段号。有效范围: 1-${progress.total_stages}`
      });
    }
    
    const stageContent = progress.learningContent?.stages?.find(s => s.stage === stage);
    if (!stageContent) {
      console.log(`❌ 阶段${stage}内容不存在，可用阶段:`, 
        progress.learningContent?.stages?.map(s => s.stage) || []);
      
      // 创建默认阶段内容 (只支持文件学习)
      const defaultStage = {
        stage: stage,
        title: `第${stage}阶段学习`,
        content: progress.learningContent?.originalContent?.substring(
          (stage - 1) * 800, 
          stage * 800
        ) + '...' || '学习内容加载中...',
        keyPoints: progress.learningContent?.stages?.[0]?.keyPoints || ['学习要点'],
        duration: '学习时间灵活安排',
        fileName: progress.fileName,
        totalStages: progress.total_stages,
        currentStage: stage,
        topics: progress.learningContent?.topics || ['学习内容']
      };
      
      // Return default stage content
      return res.json({
        success: true,
        data: defaultStage
      });
    }
    
    console.log(`✅ 成功获取阶段${stage}内容:`, stageContent.title);
    
    res.json({
      success: true,
      data: stageContent
    });
  } catch (error) {
    console.error('获取阶段内容失败:', error);
    res.status(500).json({
      success: false,
      message: '获取阶段内容失败',
      error: error.message
    });
  }
});

// Session management has been simplified for file-based learning only

// 🔄 新增：更新学习进度API (支持WebSocket实时通知)
router.put('/progress/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { stage, completed, action } = req.body;
    
    const userIdInt = parseInt(userId);
    const progress = learningProgress[userIdInt];
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: '没有找到学习进度记录'
      });
    }
    
    const oldStage = progress.current_stage;
    let newStage = stage ? parseInt(stage) : oldStage;
    
    // 处理不同的进度更新操作
    switch (action) {
      case 'next_stage':
        if (oldStage < progress.total_stages) {
          newStage = oldStage + 1;
        }
        break;
      case 'prev_stage':
        if (oldStage > 1) {
          newStage = oldStage - 1;
        }
        break;
      case 'complete':
        progress.completed = true;
        progress.completedAt = new Date().toISOString();
        break;
      case 'set_stage':
        if (newStage >= 1 && newStage <= progress.total_stages) {
          // 允许设置指定阶段
        } else {
          return res.status(400).json({
            success: false,
            message: `无效的阶段号。有效范围: 1-${progress.total_stages}`
          });
        }
        break;
      default:
        // 默认行为：更新到指定阶段
        if (newStage < 1 || newStage > progress.total_stages) {
          return res.status(400).json({
            success: false,
            message: `无效的阶段号。有效范围: 1-${progress.total_stages}`
          });
        }
    }    // Update progress
    progress.current_stage = newStage;
    progress.lastUpdated = new Date().toISOString();
    
    if (completed !== undefined) {
      progress.completed = completed;
      if (completed) {
        progress.completedAt = new Date().toISOString();
      }
    }
      // 💾 保存进度到数据库 - 🔧 修改逻辑：仅在学习完成时保存临时进度，正式进度需要测试通过
    try {
      if (progress.learningType === 'tag' && progress.tagId) {
        // 保存标签学习进度（保持原有逻辑）
        database.saveTagProgress(
          userIdInt, 
          progress.tagId, 
          newStage, 
          progress.total_stages, 
          progress.completed
        );
        console.log('✅ 标签学习进度已保存到数据库:', {
          userId: userIdInt,
          tagId: progress.tagId,
          stage: newStage,
          completed: progress.completed
        });
      } else if (progress.learningType === 'file' && progress.fileId) {
        // 🔧 文件学习进度：不在这里保存，只在测试通过80分后保存
        console.log('📝 文件学习进度仅保存在内存中，等待测试结果:', {
          userId: userIdInt,
          fileId: progress.fileId,
          stage: newStage,
          completed: progress.completed,
          note: '正式进度将在测试通过80分后保存到数据库'
        });
      }
    } catch (dbError) {
      console.error('❌ 保存学习进度到数据库失败:', dbError);
      // 不影响响应，只记录错误
    }
    
    // 🔄 Send WebSocket notification - learning progress update
    try {
      const notificationData = {
        type: 'progress_updated',
        userId: userIdInt,
        learningType: progress.learningType,
        oldStage: oldStage,
        newStage: newStage,
        totalStages: progress.total_stages,
        completed: progress.completed,
        action: action,
        timestamp: progress.lastUpdated
      };
      
      if (progress.learningType === 'file') {
        notificationData.fileId = progress.fileId;
        notificationData.fileName = progress.fileName;
      }
      
      webSocketService.notifyLearningProgress(userIdInt, notificationData);
      
      // If learning is complete, send completion notification
      if (progress.completed) {
        webSocketService.notifyLearningProgress(userIdInt, {
          type: 'learning_completed',
          userId: userIdInt,
          learningType: progress.learningType,
          totalStages: progress.total_stages,
          completedAt: progress.completedAt,
          ...notificationData
        });
      }
      
    } catch (wsError) {
      console.warn('WebSocket通知发送失败:', wsError);
    }
    
    res.json({
      success: true,
      progress: {
        userId: userIdInt,
        learningType: progress.learningType,
        currentStage: newStage,
        totalStages: progress.total_stages,
        completed: progress.completed,
        lastUpdated: progress.lastUpdated,
        completedAt: progress.completedAt
      },
      message: `学习进度已更新到第${newStage}阶段`
    });
    
  } catch (error) {
    console.error('更新学习进度失败:', error);
    res.status(500).json({
      success: false,
      message: '更新学习进度失败',
      error: error.message
    });
  }
});

// 🔄 新增：获取学习进度API
router.get('/progress/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);
    const progress = learningProgress[userIdInt];
      if (!progress) {
      // 🔧 返回成功但空的進度，避免404錯誤
      return res.json({
        success: true,
        data: null,
        message: '用戶暫無學習進度'
      });
    }
    
    res.json({
      success: true,
      data: {
        userId: userIdInt,
        learningType: progress.learningType,
        current_stage: progress.current_stage,
        total_stages: progress.total_stages,
        completed: progress.completed,
        startedAt: progress.startedAt,
        lastUpdated: progress.lastUpdated,
        completedAt: progress.completedAt,
        fileId: progress.fileId,
        fileName: progress.fileName
      }
    });
    
  } catch (error) {
    console.error('获取学习进度失败:', error);
    res.status(500).json({
      success: false,
      message: '获取学习进度失败',
      error: error.message
    });
  }
});

// 🔄 重置学习进度API - 支持单文件学习进度重置
router.post('/progress/reset/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);
    
    console.log(`🔄 重置用户${userIdInt}的学习进度...`);
    
    if (isNaN(userIdInt)) {
      return res.status(400).json({
        success: false,
        message: '用户ID必须是有效的数字'
      });
    }
    
    // 清理内存中的学习进度
    if (learningProgress[userIdInt]) {
      delete learningProgress[userIdInt];
      console.log(`✅ 已清理用户${userIdInt}的内存学习进度`);
    }
    
    // 清理用户会话
    if (userSessions.has(userIdInt)) {
      userSessions.delete(userIdInt);
      console.log(`✅ 已清理用户${userIdInt}的学习会话`);
    }
      // 尝试清理数据库中的学习进度（如果存在）
    try {
      if (database.db) {
        // 删除用户所有的学习进度记录
        const result = database.db.prepare('DELETE FROM learning_progress WHERE user_id = ?').run(userIdInt);
        console.log(`✅ 数据库中删除了${result.changes}条用户${userIdInt}的学习进度记录`);
      }
    } catch (dbError) {
      console.warn('⚠️ 清理数据库学习进度时出错:', dbError);
      // 不阻断请求，继续执行
    }
    
    // 发送WebSocket通知
    try {
      webSocketService.notifyLearningProgress(userIdInt, {
        type: 'learning_reset',
        userId: userIdInt,
        message: '学习进度已重置',
        timestamp: new Date().toISOString()
      });
    } catch (wsError) {
      console.warn('WebSocket重置通知发送失败:', wsError);
    }
    
    console.log(`✅ 用户${userIdInt}的学习进度重置完成`);
    
    res.json({
      success: true,
      message: '学习进度已成功重置',
      data: {
        userId: userIdInt,
        resetAt: new Date().toISOString(),
        clearedMemory: true,
        clearedSession: true
      }
    });
    
  } catch (error) {
    console.error('重置学习进度失败:', error);
    res.status(500).json({
      success: false,
      message: '重置学习进度失败',
      error: error.message
    });
  }
});

// 🔄 会话验证API - 验证用户学习会话是否有效
router.get('/validate-session/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);
    
    if (isNaN(userIdInt)) {
      return res.status(400).json({
        success: false,
        message: '用户ID必须是有效的数字'
      });
    }
    
    const session = userSessions.get(userIdInt);
    const progress = learningProgress[userIdInt];
    
    // 检查会话是否存在且有效
    const sessionValid = session && session.sessionId && 
      (Date.now() - session.lastActivity) < 30 * 60 * 1000; // 30分钟超时
    
    const hasProgress = !!progress;
    
    res.json({
      success: true,
      data: {
        sessionValid,
        hasProgress,
        session: session ? {
          sessionId: session.sessionId,
          lastActivity: session.lastActivity,
          learningState: session.learningState
        } : null,
        progress: progress ? {
          learningType: progress.learningType,
          currentStage: progress.current_stage,
          totalStages: progress.total_stages,
          completed: progress.completed,
          fileId: progress.fileId,
          fileName: progress.fileName
        } : null
      }
    });
    
  } catch (error) {
    console.error('验证会话失败:', error);
    res.status(500).json({
      success: false,
      message: '验证会话失败',
      error: error.message
    });
  }
});

// 🔄 内容验证API - 验证学习阶段内容是否可用
// 🔄 进度清理API - 清理无效的学习进度
router.post('/progress/cleanup/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);
    
    if (isNaN(userIdInt)) {
      return res.status(400).json({
        success: false,
        message: '用户ID必须是有效的数字'
      });
    }
    
    let cleaned = false;
    const progress = learningProgress[userIdInt];
    
    if (progress) {
      // 检查文件是否仍然可用
      const uploadModule = require('./upload');
      const selectedFile = uploadModule.fileDatabase.find(f => f.id === progress.fileId);
      
      if (!selectedFile || selectedFile.status !== 'completed') {
        console.log(`🧹 清理用户${userIdInt}的无效学习进度（文件不可用）`);
        delete learningProgress[userIdInt];
        
        // 清理会话
        if (userSessions.has(userIdInt)) {
          userSessions.delete(userIdInt);
        }
        
        cleaned = true;
      }
    }
    
    res.json({
      success: true,
      data: {
        cleaned,
        message: cleaned ? '已清理无效的学习进度' : '没有发现需要清理的进度'
      }
    });
    
  } catch (error) {
    console.error('清理进度失败:', error);
    res.status(500).json({
      success: false,
      message: '清理进度失败',
      error: error.message
    });
  }
});

// 获取标签下排序后的学习材料（带依赖校验）
router.get('/tag/:tagId/materials', async (req, res) => {
  try {
    const { tagId } = req.params;
    const userId = req.user?.id;
    // 获取排序后的文件列表
    const files = database.tagFileOrder.getFilesByTagOrdered(tagId);
    // 获取用户学习进度
    const progressList = database.learningProgress.getUserAllProgress(userId);
    // 生成依赖校验结果
    let canLearn = true;
    const result = files.map((file, idx) => {
      // 检查前一个文件是否完成
      let prevCompleted = true;
      if (idx > 0) {
        const prevFile = files[idx - 1];
        const prevProgress = progressList.find(p => p.file_id == prevFile.id);
        prevCompleted = prevProgress && prevProgress.completed;
      }
      // 当前文件进度
      const fileProgress = progressList.find(p => p.file_id == file.id);
      // 只有前一个完成才能学下一个
      canLearn = canLearn && prevCompleted;
      return {
        ...file,
        canLearn: canLearn,
        progress: fileProgress || null
      };
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取材料失败', error: error.message });
  }
});

// 🔧 新增：提交测试结果并保存学习进度
router.post('/complete-with-test', requireAuth, async (req, res) => {
  try {
    const { userId, fileId, testScore } = req.body;
    
    console.log('🏆 提交测试结果并完成学习:', { userId, fileId, testScore });
    
    if (!userId || !fileId || testScore === undefined) {
      return res.status(400).json({
        success: false,
        message: '用户ID、文件ID和测试分数不能为空'
      });
    }
    
    const userIdInt = parseInt(userId);
    const testScoreInt = parseInt(testScore);
    
    if (isNaN(userIdInt) || isNaN(testScoreInt)) {
      return res.status(400).json({
        success: false,
        message: '用户ID和测试分数必须是有效的数字'
      });
    }

    // 检查内存中的学习进度
    const memoryProgress = learningProgress[userIdInt];
    if (!memoryProgress || memoryProgress.fileId !== fileId) {
      return res.status(404).json({
        success: false,
        message: '未找到对应的学习进度，请先完成学习'
      });
    }

    // 检查学习是否已完成
    if (!memoryProgress.completed) {
      return res.status(400).json({
        success: false,
        message: '请先完成所有学习阶段再进行测试'
      });
    }

    // 尝试保存学习进度（只有分数≥80才会真正保存）
    try {
      const saveResult = database.saveFileProgress(
        userIdInt,
        fileId,
        memoryProgress.total_stages, // 当前阶段设为总阶段数（完成）
        memoryProgress.total_stages,
        true, // 已完成
        testScoreInt // 测试分数
      );

      if (saveResult && testScoreInt >= 80) {
        // 清理内存中的学习进度
        delete learningProgress[userIdInt];
        
        console.log('✅ 学习进度已保存到数据库，测试通过');
        
        // 发送WebSocket通知
        try {
          webSocketService.notifyLearningProgress(userIdInt, {
            type: 'learning_completed_with_test',
            fileId: fileId,
            fileName: memoryProgress.fileName,
            testScore: testScoreInt,
            passed: true,
            completedAt: new Date().toISOString()
          });
        } catch (wsError) {
          console.warn('WebSocket通知发送失败:', wsError);
        }

        res.json({
          success: true,
          message: `恭喜！您以${testScoreInt}分的成绩完成了《${memoryProgress.fileName}》的学习`,
          data: {
            testScore: testScoreInt,
            passed: true,
            progressSaved: true,
            canProceedToNext: true
          }
        });
      } else {
        console.log(`⚠️ 测试分数${testScoreInt}未达到80分，学习进度未保存`);
        
        res.json({
          success: true,
          message: `测试分数${testScoreInt}分未达到80分标准，请重新学习或重新测试`,
          data: {
            testScore: testScoreInt,
            passed: false,
            progressSaved: false,
            canProceedToNext: false,
            requiredScore: 80
          }
        });
      }
    } catch (dbError) {
      console.error('❌ 保存学习进度失败:', dbError);
      res.status(500).json({
        success: false,
        message: '保存学习进度失败',
        error: dbError.message
      });
    }

  } catch (error) {
    console.error('❌ 完成学习失败:', error);
    res.status(500).json({
      success: false,
      message: '完成学习失败',
      error: error.message
    });
  }
});

// 🔧 新增：获取用户在某个标签下的学习进度（用于检查前置条件）
router.get('/tag-progress/:userId/:tagId', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(userId) || isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '用户ID和标签ID必须是有效的数字'
      });
    }

    // 获取该标签下所有文件的学习进度
    const tagFiles = database.tagFileOrder.getFilesByTagOrdered(tagId);
    const progressList = [];

    for (const file of tagFiles) {
      const progress = database.getFileProgress(userId, file.id);
      progressList.push({
        fileId: file.id,
        fileName: file.original_name,
        orderIndex: file.order_index,
        completed: !!progress?.completed,
        testScore: progress?.test_score || null,
        canLearn: database.canUserLearnFile(userId, file.id)
      });
    }

    res.json({
      success: true,
      data: {
        userId,
        tagId,
        files: progressList
      }
    });

  } catch (error) {
    console.error('❌ 获取标签学习进度失败:', error);
    res.status(500).json({
      success: false,
      message: '获取标签学习进度失败',
      error: error.message
    });
  }
});

// admin 查询所有用户学习进度
router.get('/admin/all-progress', requireAdmin, async (req, res) => {
  try {
    const { userId, tagId, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT lp.*, u.username, t.name as tag_name, f.original_name as file_name
      FROM learning_progress lp
      LEFT JOIN users u ON lp.user_id = u.id
      LEFT JOIN tags t ON lp.tag_id = t.id
      LEFT JOIN uploaded_files f ON lp.file_id = f.id
      WHERE 1=1`;
    const params = [];
    if (userId && userId !== '') {
      sql += ' AND lp.user_id = ?';
      params.push(userId);
    }
    if (tagId && tagId !== '') {
      sql += ' AND lp.tag_id = ?';
      params.push(tagId);
    }
    sql += ' ORDER BY lp.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    
    console.log('执行SQL:', sql, '参数:', params);
    const rows = database.all(sql, params);
    console.log('查询结果:', rows);
    
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('获取学习进度失败:', error);
    res.status(500).json({ success: false, message: '获取学习进度失败', error: error.message });
  }
});

// 导出路由和学习进度数据
module.exports = router;
module.exports.learningProgress = learningProgress;
