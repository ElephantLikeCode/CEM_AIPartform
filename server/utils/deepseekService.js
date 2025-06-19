const axios = require('axios');
const dotenv = require('dotenv');

// 确保加载环境变量
dotenv.config();

class DeepSeekService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseURL = 'https://api.deepseek.com/v1';
    this.model = 'deepseek-chat';
    
    // 在构造函数中输出调试信息
    console.log('🔧 DeepSeek服务初始化');
    console.log('🔑 API Key状态:', this.apiKey ? '已配置' : '未配置');
    console.log('🔧 DeepSeek功能开关:', this.isDeepSeekEnabled() ? '已启用' : '已禁用');
    if (this.apiKey) {
      console.log('🔑 API Key前缀:', this.apiKey.substring(0, 10) + '...');
    }
  }

  // 检查DeepSeek功能是否启用
  isDeepSeekEnabled() {
    const enabled = process.env.DEEPSEEK_ENABLED;
    return enabled === 'true' || enabled === undefined; // 默认启用
  }
  // 检查DeepSeek API是否可用
  async checkAvailability() {
    try {
      // 首先检查功能开关
      if (!this.isDeepSeekEnabled()) {
        console.log('⚠️ DeepSeek功能已在配置中禁用');
        return false;
      }

      if (!this.apiKey) {
        console.warn('⚠️ DeepSeek API Key 未配置');
        return false;
      }
      
      console.log('🔍 检查DeepSeek API可用性...');
      
      // 进行实际的API测试调用
      const testResponse = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: 'test'
          }
        ],
        max_tokens: 10,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ DeepSeek API连接测试成功');
      return true;
      
    } catch (error) {
      console.error('❌ DeepSeek API检查失败:', error.message);
      if (error.response) {
        console.error('API响应状态:', error.response.status);
        console.error('API响应数据:', error.response.data);
      }
      return false;
    }
  }
  // 调用DeepSeek API进行内容分析
  async analyzeContent(content, fileName, analysisType = 'comprehensive') {
    try {
      // 检查功能开关
      if (!this.isDeepSeekEnabled()) {
        throw new Error('DeepSeek功能已禁用，请在配置中启用 DEEPSEEK_ENABLED=true');
      }

      if (!this.apiKey) {
        throw new Error('DeepSeek API Key 未配置，请在环境变量中设置 DEEPSEEK_API_KEY');
      }

      console.log(`🤖 使用DeepSeek API分析文档: ${fileName}`);
      console.log(`📊 分析类型: ${analysisType}`);
      console.log(`📄 内容长度: ${content.length} 字符`);

      const prompt = this.buildAnalysisPrompt(content, fileName, analysisType);
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      const result = response.data.choices[0].message.content;
      console.log('✅ DeepSeek API分析完成');
      
      return this.parseAnalysisResult(result, analysisType);

    } catch (error) {
      console.error('❌ DeepSeek API调用失败:', error.message);
      if (error.response) {
        console.error('API响应错误:', error.response.data);
      }
      throw error;
    }
  }

  // 构建分析提示词
  buildAnalysisPrompt(content, fileName, analysisType) {
    const basePrompt = `请分析以下文档内容，提供专业的深度分析。

文档名称: ${fileName}
内容长度: ${content.length} 字符

=== 文档内容 ===
${content.substring(0, 6000)}
=== 内容结束 ===`;

    const typePrompts = {
      comprehensive: `
请提供全面的文档分析，包括：
1. 核心主题和重点内容
2. 知识架构和逻辑结构  
3. 关键概念和专业术语
4. 学习建议和应用场景
5. 内容价值评估

请以JSON格式返回分析结果：
{
  "summary": "文档核心内容概述",
  "keyTopics": ["主题1", "主题2", "主题3"],
  "keyPoints": ["要点1", "要点2", "要点3", "要点4", "要点5"],
  "concepts": ["概念1", "概念2", "概念3"],
  "learningPath": "建议的学习路径",
  "applicationScenarios": ["应用场景1", "应用场景2"],
  "valueAssessment": "内容价值评估",
  "difficulty": "初级/中级/高级",
  "estimatedStudyTime": "预估学习时间（分钟）"
}`,
      
      quality: `
请评估文档的质量和价值，包括：
1. 内容完整性和准确性
2. 逻辑结构和清晰度
3. 专业性和深度
4. 实用性和应用价值
5. 改进建议

请以JSON格式返回评估结果：
{
  "qualityScore": 85,
  "completeness": "内容完整性评估",
  "accuracy": "准确性评估", 
  "clarity": "清晰度评估",
  "professionalism": "专业性评估",
  "practicality": "实用性评估",
  "strengths": ["优点1", "优点2", "优点3"],
  "weaknesses": ["不足1", "不足2"],
  "improvements": ["改进建议1", "改进建议2"],
  "recommendation": "总体推荐意见"
}`,

      extract: `
请从文档中提取关键信息，包括：
1. 重要数据和统计信息
2. 关键流程和步骤
3. 重要人物、机构、地点
4. 专业术语和定义
5. 核心观点和结论

请以JSON格式返回提取结果：
{
  "keyData": ["数据1", "数据2", "数据3"],
  "processes": ["流程1", "流程2"],
  "entities": {
    "people": ["人物1", "人物2"],
    "organizations": ["机构1", "机构2"],
    "locations": ["地点1", "地点2"]
  },
  "definitions": [
    {"term": "术语1", "definition": "定义1"},
    {"term": "术语2", "definition": "定义2"}
  ],
  "conclusions": ["结论1", "结论2", "结论3"],
  "references": ["参考1", "参考2"]
}`
    };

    return basePrompt + (typePrompts[analysisType] || typePrompts.comprehensive);
  }

  // 解析分析结果
  parseAnalysisResult(result, analysisType) {
    try {
      // 尝试提取JSON内容
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          analysisType: analysisType,
          data: parsed,
          rawResponse: result,
          timestamp: new Date().toISOString(),
          source: 'deepseek-api'
        };
      } else {
        // 如果没有JSON格式，返回原始文本
        return {
          success: true,
          analysisType: analysisType,
          data: {
            summary: result,
            note: '分析结果为文本格式，未能解析为结构化数据'
          },
          rawResponse: result,
          timestamp: new Date().toISOString(),
          source: 'deepseek-api'
        };
      }
    } catch (error) {
      console.error('解析DeepSeek分析结果失败:', error);
      return {
        success: false,
        error: error.message,
        rawResponse: result,
        timestamp: new Date().toISOString(),
        source: 'deepseek-api'
      };
    }
  }

  // 生成学习建议
  async generateLearningAdvice(content, fileName, currentLevel = 'beginner') {
    try {
      console.log(`📚 生成学习建议: ${fileName} (水平: ${currentLevel})`);
      
      const prompt = `基于以下文档内容，为${currentLevel}水平的学习者生成个性化学习建议。

文档: ${fileName}
学习者水平: ${currentLevel}

=== 文档内容 ===
${content.substring(0, 5000)}
=== 内容结束 ===

请生成详细的学习建议，包括：
1. 学习前准备
2. 学习重点和难点
3. 推荐学习顺序
4. 实践练习建议
5. 延伸学习资源

请以JSON格式返回：
{
  "preparation": "学习前的准备工作",
  "focusAreas": ["重点1", "重点2", "重点3"],
  "difficulties": ["难点1", "难点2"],
  "learningOrder": ["步骤1", "步骤2", "步骤3"],
  "practiceActivities": ["练习1", "练习2", "练习3"],
  "additionalResources": ["资源1", "资源2"],
  "timeEstimate": "预计学习时间",
  "tips": ["学习技巧1", "学习技巧2"]
}`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const result = response.data.choices[0].message.content;
      return this.parseAnalysisResult(result, 'learning_advice');

    } catch (error) {
      console.error('❌ 生成学习建议失败:', error.message);
      throw error;
    }
  }

  // 🔧 新增：聊天对话方法
  async chat(prompt) {
    try {
      if (!this.apiKey) {
        throw new Error('DeepSeek API Key 未配置');
      }

      console.log('💬 DeepSeek聊天对话开始');
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const result = response.data.choices[0].message.content;
      console.log('✅ DeepSeek聊天完成');
      
      return result;

    } catch (error) {
      console.error('❌ DeepSeek聊天失败:', error.message);
      throw error;
    }
  }

  // 🔧 新增：通用的内容生成方法
  async generateCompletion(prompt, options = {}) {
    try {
      // 检查功能开关
      if (!this.isDeepSeekEnabled()) {
        throw new Error('DeepSeek功能已禁用，请在配置中启用 DEEPSEEK_ENABLED=true');
      }

      if (!this.apiKey) {
        throw new Error('DeepSeek API Key 未配置，请在环境变量中设置 DEEPSEEK_API_KEY');
      }

      console.log('🤖 DeepSeek生成内容中...');
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature || 0.1,
        max_tokens: options.max_tokens || 4000,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: options.timeout || 60000
      });

      const result = response.data.choices[0].message.content;
      console.log('✅ DeepSeek内容生成完成');
      
      return result;    } catch (error) {
      console.error('❌ DeepSeek内容生成失败:', error.message);
      if (error.response) {
        console.error('API响应错误:', error.response.data);
      }
      throw error;
    }
  }

  // 🤖 新增：问答功能 - 基于上下文生成回答
  async generateAnswer(question, context) {
    try {
      console.log('🤖 使用DeepSeek生成问答回答...');
      console.log(`问题: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`);
      console.log(`上下文长度: ${context.length}字符`);

      if (!this.isDeepSeekEnabled()) {
        throw new Error('DeepSeek服务未启用');
      }

      if (!this.apiKey) {
        throw new Error('DeepSeek API Key未配置');
      }

      const prompt = `你是一个智能助手，请基于以下提供的知识库内容，准确回答用户的问题。

【知识库内容】：
${context}

【用户问题】：
${question}

【回答要求】：
1. 请仅基于提供的知识库内容进行回答
2. 如果知识库中没有相关信息，请诚实说明
3. 回答要准确、简洁、有条理
4. 如果可能，请引用具体的文档或段落
5. 用中文回答

请直接给出回答，不要包含"【回答】："等格式标记。`;

      console.log('🔄 调用DeepSeek API生成回答...');
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (!response.data || !response.data.choices || response.data.choices.length === 0) {
        throw new Error('DeepSeek API返回无效响应');
      }

      let answer = response.data.choices[0].message.content.trim();
      
      // 清理回答格式
      answer = answer.replace(/^【回答】：?/i, '').trim();
      answer = answer.replace(/^回答：?/i, '').trim();
      
      console.log(`✅ DeepSeek问答回答生成成功，长度: ${answer.length}字符`);
      console.log(`📊 API使用情况 - Tokens: ${response.data.usage?.total_tokens || 'N/A'}`);
      
      return answer;

    } catch (error) {
      console.error('❌ DeepSeek问答生成失败:', error.message);
      if (error.response) {
        console.error('API响应错误:', error.response.data);
      }
      throw new Error(`DeepSeek问答生成失败: ${error.message}`);
    }
  }
}

module.exports = new DeepSeekService();
