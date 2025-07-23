const express = require('express');
const beijingTime = require('../utils/beijingTime'); // 🕐 北京时间工具
const router = express.Router();
const database = require('../database/database');
const aiService = require('../utils/aiService');
const deepseekService = require('../utils/deepseekService');
const { requireAuth } = require('../middleware/auth'); // 🔒 新增：认证中间件
const { v4: uuidv4 } = require('uuid');

// 🤖 AI对话管理路由 - 支持侧边栏历史对话

// 获取用户的对话列表
router.get('/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`📋 获取用户${userId}的对话列表`);
    // 查询用户的对话列表，按更新时间排序，并计算实际消息数量
    const conversations = database.all(`
      SELECT 
        ac.id, 
        ac.session_id, 
        ac.title, 
        ac.knowledge_mode, 
        ac.knowledge_source_name,
        ac.ai_model, 
        ac.created_at, 
        ac.updated_at,
        COALESCE(msg_count.message_count, 0) as message_count
      FROM ai_conversations ac
      LEFT JOIN (
        SELECT 
          conversation_id, 
          COUNT(*) as message_count
        FROM ai_conversation_messages 
        GROUP BY conversation_id
      ) msg_count ON ac.id = msg_count.conversation_id
      WHERE ac.user_id = ? AND ac.expires_at > datetime('now')
      ORDER BY ac.updated_at DESC
    `, [userId]);
    res.json({
      success: true,
      data: conversations || [],
      total: conversations ? conversations.length : 0
    });
  } catch (error) {
    console.error('❌ 获取对话列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取对话列表失败',
      error: error.message
    });
  }
});

// 创建新对话
router.post('/', requireAuth, async (req, res) => {
  try {
    const { 
      userId, 
      title, 
      knowledgeMode = 'all', 
      knowledgeSourceId, 
      knowledgeSourceName,
      aiModel = 'local' 
    } = req.body;
    
    // 确保模型设置遵循全局配置，而不是在创建时被覆盖
    const globalSettings = require('../routes/system').getCurrentAISettings();
    const finalAiModel = globalSettings.currentModel;

    console.log(`🆕 创建新对话:`, { userId, title, knowledgeMode, knowledgeSourceId, aiModel });
    
    // 验证参数
    if (!userId || !title) {
      return res.status(400).json({
        success: false,
        message: '用户ID和标题是必需的'
      });
    }
    
    // 🔧 验证知识库模式和源ID
    if (knowledgeMode !== 'tag' && knowledgeMode !== 'document') {
      return res.status(400).json({
        success: false,
        message: '知识库模式必须是tag或document'
      });
    }
    
    if (!knowledgeSourceId) {
      return res.status(400).json({
        success: false,
        message: '必须指定知识库源ID'
      });
    }
    
    // 生成会话ID
    const sessionId = uuidv4();
    
    // 设置过期时间（24小时后）
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // 插入新对话
    const conversation = database.run(`
      INSERT INTO ai_conversations (
        session_id, user_id, title, knowledge_mode, knowledge_source_id,
        knowledge_source_name, ai_model, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)    `, [
      sessionId, userId, title, knowledgeMode, 
      knowledgeSourceId, knowledgeSourceName, finalAiModel, 
      expiresAt.toISOString()
    ]);
    
    // 返回新创建的对话信息
    const newConversation = database.get(`
      SELECT * FROM ai_conversations WHERE id = ?
    `, [conversation.lastInsertRowid]);
    
    res.json({
      success: true,
      data: newConversation,
      message: '对话创建成功'
    });
    
  } catch (error) {
    console.error('❌ 创建对话失败:', error);
    res.status(500).json({
      success: false,
      message: '创建对话失败',
      error: error.message
    });
  }
});

// 获取对话详情和消息历史
router.get('/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;
    
    console.log(`📨 获取对话${sessionId}的消息历史`);
    
    // 验证对话存在且属于用户
    const conversation = database.get(`
      SELECT * FROM ai_conversations 
      WHERE session_id = ? AND user_id = ? AND expires_at > datetime('now')
    `, [sessionId, userId]);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: '对话不存在或已过期'
      });
    }
    
    // 只查属于该会话的消息
    const messages = database.all(`
      SELECT 
        message_id, message_type, content, context_data,
        ai_model, tokens_used, created_at
      FROM ai_conversation_messages 
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `, [conversation.id]);
    
    res.json({
      success: true,
      data: {
        conversation: conversation,
        messages: messages.map(msg => ({
          ...msg,
          context_data: msg.context_data ? JSON.parse(msg.context_data) : null
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ 获取消息历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取消息历史失败',
      error: error.message
    });
  }
});

// 发送消息到对话
router.post('/:sessionId/messages', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, message, contextData } = req.body;
    
    console.log(`💬 用户${userId}向对话${sessionId}发送消息`);
    
    // 验证对话存在且属于用户
    const conversation = database.get(`
      SELECT * FROM ai_conversations 
      WHERE session_id = ? AND user_id = ? AND expires_at > datetime('now')
    `, [sessionId, userId]);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: '对话不存在或已过期'
      });
    }
    
    // 验证消息内容
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '消息内容不能为空'
      });
    }
    
    // 保存用户消息
    const userMessageId = uuidv4();
    database.run(`
      INSERT INTO ai_conversation_messages (
        conversation_id, message_id, message_type, content, context_data
      ) VALUES (?, ?, 'user', ?, ?)
    `, [
      conversation.id, userMessageId, message, 
      contextData ? JSON.stringify(contextData) : null
    ]);
    
    // 获取知识库上下文
    let knowledgeContext = '';
    try {
      knowledgeContext = await getKnowledgeContext(
        conversation.knowledge_mode,
        conversation.knowledge_source_id,
        message
      );
    } catch (contextError) {
      console.warn('⚠️ 获取知识库上下文失败:', contextError.message);
    }
      // 生成AI回答
    let aiResponse = '';
    let tokensUsed = 0;
    
    // � 使用全局AI设置，确保与创建对话时的设置一致
    const globalSettings = require('../routes/system').getCurrentAISettings();
    const actualModel = globalSettings.currentModel;
    
    try {
      if (actualModel === 'deepseek') {
        // 使用DeepSeek API
        if (!deepseekService.isDeepSeekEnabled()) {
          throw new Error('DeepSeek功能已禁用');
        }
        
        const isAvailable = await deepseekService.checkAvailability();
        if (!isAvailable) {
          throw new Error('DeepSeek API不可用');
        }
        
        aiResponse = await deepseekService.generateAnswer(message, knowledgeContext);
      } else {
        // 使用本地AI服务
        aiResponse = await aiService.generateAnswer(message, knowledgeContext);
      }
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        aiResponse = '抱歉，我无法基于当前的知识库内容回答这个问题。请尝试换一种表达方式。';
      }
      
    } catch (aiError) {
      console.error(`❌ AI回答生成失败 (模型: ${actualModel}):`, aiError);
      
      // 如果DeepSeek不可用，尝试回退到本地AI服务
      if (actualModel === 'deepseek' && aiError.message.includes('DeepSeek')) {
        console.log('🔄 DeepSeek不可用，自动切换到本地AI服务');
        try {
          aiResponse = await aiService.generateAnswer(message, knowledgeContext);
          if (!aiResponse || aiResponse.trim().length === 0) {
            aiResponse = '抱歉，我无法基于当前的知识库内容回答这个问题。请尝试换一种表达方式。';
          }
          // 在回答前添加提示
          aiResponse = '⚠️ 高级AI服务暂时不可用，已切换到基础AI服务为您提供回答：\n\n' + aiResponse;
        } catch (fallbackError) {
          console.error('❌ 本地AI服务也失败:', fallbackError);
          aiResponse = '抱歉，AI服务暂时不可用，请稍后重试。如果问题持续，请联系管理员。';
        }
      } else {
        // 其他错误处理
        if (aiError.message.includes('DeepSeek')) {
          aiResponse = '抱歉，高级AI服务暂时不可用。请稍后重试或联系管理员。';
        } else {
          aiResponse = '抱歉，AI服务暂时不可用，请稍后重试。';
        }
      }
    }
    
    // 保存AI回答
    const aiMessageId = uuidv4();
    database.run(`
      INSERT INTO ai_conversation_messages (
        conversation_id, message_id, message_type, content, 
        context_data, ai_model, tokens_used      ) VALUES (?, ?, 'assistant', ?, ?, ?, ?)
    `, [
      conversation.id, aiMessageId, aiResponse,
      knowledgeContext ? JSON.stringify({ context_length: knowledgeContext.length }) : null,
      actualModel, tokensUsed // 使用实际使用的模型
    ]);
    
    // 🔧 新增：更新对话的最后更新时间
    database.run(`
      UPDATE ai_conversations 
      SET updated_at = datetime('now')
      WHERE id = ?
    `, [conversation.id]);
    
    res.json({
      success: true,
      data: {
        userMessage: {
          id: userMessageId,
          type: 'user',
          content: message,
          timestamp: beijingTime.toBeijingISOString()
        },        aiMessage: {
          id: aiMessageId,
          type: 'assistant',
          content: aiResponse,
          timestamp: beijingTime.toBeijingISOString(),
          model: actualModel // 返回实际使用的模型
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 发送消息失败:', error);
    res.status(500).json({
      success: false,
      message: '发送消息失败',
      error: error.message
    });
  }
});

// 删除对话
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;
    
    console.log(`🗑️ 删除对话${sessionId}`);
    
    // 验证对话存在且属于用户
    const conversation = database.get(`
      SELECT id FROM ai_conversations 
      WHERE session_id = ? AND user_id = ?
    `, [sessionId, userId]);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: '对话不存在'
      });
    }
    
    // 删除对话（消息会因为外键约束自动删除）
    database.run(`
      DELETE FROM ai_conversations WHERE session_id = ? AND user_id = ?
    `, [sessionId, userId]);
    
    res.json({
      success: true,
      message: '对话删除成功'
    });
    
  } catch (error) {
    console.error('❌ 删除对话失败:', error);
    res.status(500).json({
      success: false,
      message: '删除对话失败',
      error: error.message
    });
  }
});

// 更新对话标题
router.put('/:sessionId/title', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, title } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '标题不能为空'
      });
    }
    
    // 先校验会话归属
    const conversation = database.get(`
      SELECT id FROM ai_conversations 
      WHERE session_id = ? AND user_id = ?
    `, [sessionId, userId]);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: '对话不存在'
      });
    }
    
    // 更新对话标题
    const result = database.run(`
      UPDATE ai_conversations 
      SET title = ?, updated_at = datetime('now')
      WHERE session_id = ? AND user_id = ?
    `, [title.trim(), sessionId, userId]);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: '对话不存在'
      });
    }
    
    res.json({
      success: true,
      message: '标题更新成功'
    });
    
  } catch (error) {
    console.error('❌ 更新对话标题失败:', error);
    res.status(500).json({
      success: false,
      message: '更新标题失败',
      error: error.message
    });
  }
});

// 辅助函数：获取知识库上下文
async function getKnowledgeContext(mode, sourceId, question = '') {
  console.log(`📚 获取知识库上下文: mode=${mode}, sourceId=${sourceId}`);
  
  try {
    if (mode === 'tag') {
      // 获取标签下的所有文档内容
      const ragService = require('../utils/ragService');
      return await ragService.getTagContext(sourceId);
    } else if (mode === 'document') {
      // 获取单个文档内容
      const uploadModule = require('./upload');
      const { fileDatabase } = uploadModule;
      const file = fileDatabase.find(f => f.id === sourceId);
      const content = file ? file.content || '' : '';
      console.log(`📄 文档上下文长度: ${content.length} 字符`);
      return content;
    }
    
    console.log('⚠️ 未知的知识库模式:', mode);
    return '';
  } catch (error) {
    console.error(`❌ 获取知识库上下文失败 (mode=${mode}):`, error);
    return '';
  }
}

module.exports = router;
