const vectorService = require('./vectorService');
const aiService = require('./aiService');

class RAGService {
  constructor() {
    this.aiService = aiService;
    this.vectorService = vectorService;
  }

  // RAG增强的对话回答
  async generateRAGResponse(question, context = null) {
    try {
      console.log(`🤖 RAG增强回答: "${question.substring(0, 50)}..."`);
      
      // 第一步：检索相关内容
      const relevantContent = await this.retrieveRelevantContent(question, context);
      
      // 第二步：构建增强的prompt
      const enhancedPrompt = this.buildRAGPrompt(question, context, relevantContent);
      
      // 第三步：生成回答
      const response = await this.generateResponse(enhancedPrompt);
      
      return {
        response: response,
        relevantChunks: relevantContent.length,
        context: context,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('RAG回答生成失败:', error);
      throw error;
    }
  }

  // 检索相关内容
  async retrieveRelevantContent(question, context) {
    try {
      let relevantContent = [];
      
      // 根据上下文类型确定搜索范围
      if (context && context.learningType === 'file' && context.fileName) {
        // 单文档学习 - 搜索特定文档
        const fileId = await this.getFileIdByName(context.fileName);
        if (fileId) {
          relevantContent = await this.vectorService.searchSimilarContent(question, fileId, 3);
        }
      } else if (context && context.learningType === 'tag' && context.tagName) {
        // 标签学习 - 搜索标签相关内容
        relevantContent = await this.vectorService.searchSimilarContent(question, `tag_${context.tagId}`, 5);
      } else {
        // 全局搜索
        relevantContent = await this.vectorService.searchSimilarContent(question, null, 3);
      }
      
      console.log(`🔍 检索到 ${relevantContent.length} 个相关内容块`);
      
      // 输出检索结果的详细信息
      relevantContent.forEach((content, index) => {
        console.log(`  ${index + 1}. ${content.fileName} - 相似度: ${content.similarity.toFixed(3)}`);
      });
      
      return relevantContent;
      
    } catch (error) {
      console.error('检索相关内容失败:', error);
      return [];
    }
  }

  // 根据文件名获取文件ID（简化实现）
  async getFileIdByName(fileName) {
    try {
      const uploadModule = require('../routes/upload');
      const { fileDatabase } = uploadModule;
      
      const file = fileDatabase.find(f => f.originalName === fileName);
      return file ? file.id : null;
    } catch (error) {
      console.error('获取文件ID失败:', error);
      return null;
    }
  }
  // 构建RAG增强的prompt - 🔧 优化为更精准和有针对性的回答
  buildRAGPrompt(question, context, relevantContent) {
    let prompt = `你是一位专业的AI学习助手。请基于提供的相关学习内容，为用户的问题提供准确、具体、有针对性的回答。

用户问题：${question}`;

    // 添加学习上下文
    if (context) {
      prompt += `\n\n【当前学习环境】`;
      if (context.learningType === 'file') {
        prompt += `\n学习模式：文档学习`;
        prompt += `\n当前文档：${context.fileName}`;
        prompt += `\n学习进度：第 ${context.currentStage} 阶段 / 共 ${context.totalStages} 阶段`;
        if (context.stageTitle) {
          prompt += `\n当前阶段：${context.stageTitle}`;
        }
      } else if (context.learningType === 'tag') {
        prompt += `\n学习模式：主题学习`;
        prompt += `\n当前主题：${context.tagName}`;
        prompt += `\n学习进度：第 ${context.currentStage} 阶段 / 共 ${context.totalStages} 阶段`;
        if (context.stageTitle) {
          prompt += `\n当前阶段：${context.stageTitle}`;
        }
      }
    }

    // 🔧 改进相关内容的组织方式
    if (relevantContent && relevantContent.length > 0) {
      prompt += `\n\n【相关学习内容】`;
      
      relevantContent.forEach((content, index) => {
        prompt += `\n\n[参考内容 ${index + 1}]`;
        prompt += `\n来源：${content.fileName}`;
        prompt += `\n匹配度：${content.similarity.toFixed(3)}`;
        if (content.metadata?.searchType === 'keyword') {
          prompt += `\n匹配关键词：${content.metadata.matchedKeywords.join('、')}`;
        }
        prompt += `\n内容：${content.content}`;
      });
      
      prompt += `\n\n💡 以上是系统为你找到的 ${relevantContent.length} 个相关内容片段`;
    } else {
      prompt += `\n\n⚠️ 注意：系统未找到与问题直接相关的学习内容片段`;
    }

    // 添加当前阶段内容（如果有）
    if (context && context.stageContent) {
      prompt += `\n\n【当前学习阶段内容】\n${context.stageContent}`;
    }

    // 添加学习要点（如果有）
    if (context && context.keyPoints && context.keyPoints.length > 0) {
      prompt += `\n\n【当前阶段重点】`;
      context.keyPoints.forEach((point, index) => {
        prompt += `\n${index + 1}. ${point}`;
      });
    }

    prompt += `\n\n【回答要求】
🎯 基于上述相关内容回答用户问题，要求：

1. **准确性优先**：只基于提供的学习内容回答，不要添加额外信息
2. **内容针对性**：重点结合用户当前的学习内容和阶段
3. **具体明确**：避免模糊的概括，要具体引用学习内容
4. **学习导向**：回答要有助于用户更好地理解学习内容
5. **诚实透明**：如果相关内容不足以完整回答问题，要明确说明

📝 回答格式：
- 开头简洁回答核心问题
- 引用具体的学习内容支撑你的回答
- 如适用，说明与当前学习阶段的关系
- 如有必要，提供进一步学习建议

请提供有针对性的详细回答：`;

    return prompt;
  }
  // 生成AI回答
  async generateResponse(prompt) {
    // 🔧 使用AI服务的队列化请求
    return await this.aiService.queuedAIRequest(async () => {
      const response = await this.aiService.ollama.chat({
        model: this.aiService.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.3, // 降低随机性，提高准确性
          num_ctx: 8192,
          num_predict: 1000,
          top_p: 0.8
        }
      });

      return response.message.content.trim();
    }, 'RAG增强回答');
  }

  // 为文档生成向量索引
  async indexDocument(fileId, fileName, content) {
    try {
      console.log(`📚 为文档 ${fileName} 生成RAG索引...`);
      await this.vectorService.saveDocumentVectors(fileId, fileName, content);
      console.log(`✅ 文档 ${fileName} RAG索引完成`);
    } catch (error) {
      console.error('文档RAG索引失败:', error);
      throw error;
    }
  }

  // 为标签生成向量索引
  async indexTag(tagId, tagName, mergedContent, fileIds) {
    try {
      console.log(`🏷️ 为标签 ${tagName} 生成RAG索引...`);
      await this.vectorService.saveTagVectors(tagId, tagName, mergedContent, fileIds);
      console.log(`✅ 标签 ${tagName} RAG索引完成`);
    } catch (error) {
      console.error('标签RAG索引失败:', error);
      throw error;
    }
  }

  // 删除文档索引
  async deleteDocumentIndex(fileId) {
    try {
      await this.vectorService.deleteDocumentVectors(fileId);
      console.log(`🗑️ 文档 ${fileId} RAG索引已删除`);
    } catch (error) {
      console.error('删除文档RAG索引失败:', error);
    }
  }
}

module.exports = new RAGService();
