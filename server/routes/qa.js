const express = require('express');
const router = express.Router();
const database = require('../database/database');
const ragService = require('../utils/ragService');
const aiService = require('../utils/aiService');
const deepseekService = require('../utils/deepseekService');

// 🤖 智能问答API - 支持基于标签或文档的知识库问答
router.post('/ask', async (req, res) => {
  try {
    const { question, model = 'local', mode = 'all', tagId, fileId } = req.body;
    
    console.log('🤖 收到问答请求:', {
      question: question?.substring(0, 100) + (question?.length > 100 ? '...' : ''),
      model,
      mode,
      tagId,
      fileId,
      timestamp: new Date().toISOString()
    });

    // 参数验证
    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '问题不能为空'
      });
    }

    if (question.length > 2000) {
      return res.status(400).json({
        success: false,
        message: '问题长度不能超过2000个字符'
      });
    }

    let context = '';
    let contextInfo = {
      type: mode,
      source: '全部知识库'
    };

    try {
      // 根据模式获取相关上下文
      if (mode === 'tag' && tagId) {
        console.log(`📚 基于标签${tagId}获取上下文...`);
        
        // 验证标签是否存在
        const tag = database.get('SELECT * FROM tags WHERE id = ?', [parseInt(tagId)]);
        if (!tag) {
          return res.status(404).json({
            success: false,
            message: '指定的标签不存在'
          });
        }

        contextInfo.source = `标签：${tag.name}`;

        // 获取标签的学习内容
        const learningContent = database.tags.getTagLearningContent(parseInt(tagId));
        if (learningContent && learningContent.merged_content) {
          context = learningContent.merged_content;
          console.log(`✅ 从标签学习内容获取到${context.length}字符的上下文`);
        } else {
          // 如果没有合并内容，从标签下的文件获取
          const tagFiles = database.tags.getTagFiles(parseInt(tagId));
          const uploadModule = require('./upload');
          const { fileDatabase } = uploadModule;
          
          let collectedContent = '';
          for (const tagFile of tagFiles) {
            const file = fileDatabase.find(f => f.id === tagFile.file_id);
            if (file && file.status === 'completed' && file.content) {
              collectedContent += `\n\n=== ${file.originalName} ===\n${file.content}`;
            }
          }
          
          context = collectedContent;
          console.log(`✅ 从标签下的文件获取到${context.length}字符的上下文`);
        }

      } else if (mode === 'document' && fileId) {
        console.log(`📄 基于文档${fileId}获取上下文...`);
        
        // 获取指定文档的内容
        const uploadModule = require('./upload');
        const selectedFile = uploadModule.fileDatabase.find(f => f.id === fileId);
        
        if (!selectedFile) {
          return res.status(404).json({
            success: false,
            message: '指定的文档不存在'
          });
        }

        if (selectedFile.status !== 'completed' || !selectedFile.content) {
          return res.status(400).json({
            success: false,
            message: '指定的文档未完成处理或没有内容'
          });
        }

        context = selectedFile.content;
        contextInfo.source = `文档：${selectedFile.originalName}`;
        console.log(`✅ 从文档获取到${context.length}字符的上下文`);

      } else if (mode === 'all') {
        console.log('🌐 使用全部知识库进行问答...');
          // 使用RAG服务获取相关内容
        try {
          const ragResult = await ragService.retrieveRelevantContent(question, {
            learningType: 'general',
            scope: 'all'
          });
          
          if (ragResult && ragResult.length > 0) {
            context = ragResult.map(item => item.content || item).join('\n\n');
            console.log(`✅ RAG服务返回${ragResult.length}个相关片段，总长度${context.length}字符`);
          }
        } catch (ragError) {
          console.warn('⚠️ RAG服务查询失败，尝试使用所有文档内容:', ragError);
          
          // RAG失败时，使用所有可用文档的内容
          const uploadModule = require('./upload');
          const { fileDatabase } = uploadModule;
          
          const completedFiles = fileDatabase.filter(f => 
            f.status === 'completed' && f.content && f.content.trim().length > 0
          );
          
          if (completedFiles.length > 0) {
            context = completedFiles
              .map(f => `=== ${f.originalName} ===\n${f.content}`)
              .join('\n\n');
            console.log(`✅ 使用${completedFiles.length}个文档作为上下文，总长度${context.length}字符`);
          }
        }
      }

      // 如果没有获取到上下文，返回错误
      if (!context || context.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: `在${contextInfo.source}中没有找到相关内容，无法回答问题`
        });
      }

      // 限制上下文长度避免超出模型限制
      if (context.length > 8000) {
        context = context.substring(0, 8000) + '\n[内容已截断...]';
        console.log('⚠️ 上下文过长，已截断到8000字符');
      }

    } catch (contextError) {
      console.error('❌ 获取上下文失败:', contextError);
      return res.status(500).json({
        success: false,
        message: '获取相关内容失败: ' + contextError.message
      });
    }

    // 使用AI服务生成回答
    let answer = '';
    try {
      console.log(`🤖 使用${model}模型生成回答...`);
      
      if (model === 'deepseek') {
        // 使用DeepSeek API
        answer = await deepseekService.generateAnswer(question, context);
      } else {
        // 使用本地AI服务
        answer = await aiService.generateAnswer(question, context);
      }

      if (!answer || answer.trim().length === 0) {
        answer = '抱歉，我无法基于当前的知识库内容回答这个问题。请尝试换一种表达方式或选择不同的知识库范围。';
      }

      console.log(`✅ AI回答生成成功，长度: ${answer.length}字符`);

    } catch (aiError) {
      console.error('❌ AI生成回答失败:', aiError);
      
      // 提供备用回答
      answer = `抱歉，在处理您的问题时遇到了技术问题。错误信息：${aiError.message}`;
    }

    // 返回回答
    res.json({
      success: true,
      data: {
        question,
        answer,
        context: contextInfo,
        model,
        timestamp: new Date().toISOString(),
        contextLength: context.length
      },
      message: '问答完成'
    });

  } catch (error) {
    console.error('❌ 问答请求处理失败:', error);
    res.status(500).json({
      success: false,
      message: '问答服务暂时不可用',
      error: error.message
    });
  }
});

// 🔍 获取问答历史（可选功能）
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // 这里可以实现问答历史的存储和查询
    // 目前返回空数组，可以后续扩展
    res.json({
      success: true,
      data: [],
      total: 0,
      message: '问答历史功能待实现'
    });

  } catch (error) {
    console.error('❌ 获取问答历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取问答历史失败',
      error: error.message
    });
  }
});

// 🧹 清空问答历史（可选功能）
router.delete('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 这里可以实现问答历史的清空
    // 目前返回成功，可以后续扩展
    res.json({
      success: true,
      message: '问答历史清空功能待实现'
    });

  } catch (error) {
    console.error('❌ 清空问答历史失败:', error);
    res.status(500).json({
      success: false,
      message: '清空问答历史失败',
      error: error.message
    });
  }
});

// // 🧪 测试端点（无需认证）
// router.post('/test', async (req, res) => {
//   try {
//     const { question = '测试问题' } = req.body;
    
//     console.log('🧪 收到测试问答请求:', question);
    
//     // 简单的测试回答
//     const answer = `这是一个测试回答，您询问了：${question}。QA API正常工作！`;
    
//     res.json({
//       success: true,
//       data: {
//         question,
//         answer,
//         model: 'test',
//         timestamp: new Date().toISOString()
//       },
//       message: 'QA测试成功'
//     });

//   } catch (error) {
//     console.error('❌ QA测试失败:', error);
//     res.status(500).json({
//       success: false,
//       message: 'QA测试失败',
//       error: error.message
//     });
//   }
// });

module.exports = router;
