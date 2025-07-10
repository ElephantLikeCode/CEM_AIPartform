const { Ollama } = require('ollama');
const fs = require('fs-extra');        // 📁 文件系统操作
const pdfParse = require('pdf-parse'); // 📄 PDF解析 
const mammoth = require('mammoth');    // 📄 Word文档解析
const path = require('path');

class AIService {
  constructor() {
    this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    // 更新为您实际可用的模型
    this.model = 'llama3.1:latest'; // 使用您现有的模型
    this.fallbackModel = 'llama3.2:latest'; // 备用模型
      // 🔧 新增：并发控制
    this.isProcessing = false;
    this.requestQueue = [];
    this.maxConcurrentRequests = 1; // AI服务只能同时处理一个请求
    
    // 🔧 新增：AI开关控制
    console.log('🔧 AI服务初始化');
    console.log('🔧 AI总开关状态:', this.isAIEnabled() ? '已启用' : '已禁用');
  }

  // 检查AI功能是否启用
  isAIEnabled() {
    const enabled = process.env.AI_ENABLED;
    return enabled === 'true' || enabled === undefined; // 默认启用
  }
  // 🔧 新增：队列化的AI请求处理
  async queuedAIRequest(requestFn, requestType = 'general') {
    // 检查AI总开关
    if (!this.isAIEnabled()) {
      throw new Error('AI功能已禁用，请在配置中启用 AI_ENABLED=true');
    }

    return new Promise((resolve, reject) => {
      const request = {
        id: Date.now() + Math.random(),
        type: requestType,
        execute: requestFn,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.requestQueue.push(request);
      console.log(`📝 AI请求入队: ${requestType} (队列长度: ${this.requestQueue.length})`);
      
      this.processQueue();
    });
  }

  // 🔧 新增：处理请求队列
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const request = this.requestQueue.shift();
    
    console.log(`🚀 开始处理AI请求: ${request.type} (ID: ${request.id})`);
    
    try {
      const result = await request.execute();
      request.resolve(result);
      console.log(`✅ AI请求完成: ${request.type} (耗时: ${Date.now() - request.timestamp}ms)`);
    } catch (error) {
      console.error(`❌ AI请求失败: ${request.type}`, error.message);
      request.reject(error);
    } finally {
      this.isProcessing = false;
      
      // 处理下一个请求
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processQueue(), 100); // 短暂延迟避免过载
      }
    }
  }
  // 检查AI模型是否可用 - 改进模型匹配逻辑
  async checkModelAvailability() {
    try {
      // 检查AI总开关
      if (!this.isAIEnabled()) {
        console.log('⚠️ AI功能已在配置中禁用');
        return false;
      }

      const models = await this.ollama.list();
      console.log('可用模型:', models.models.map(m => m.name));
      
      const availableModelNames = models.models.map(m => m.name);
      
      // 检查主要模型 - 精确匹配
      if (availableModelNames.includes(this.model)) {
        console.log(`✅ 主要模型 ${this.model} 可用`);
        return true;
      }
      
      // 检查是否有llama3.1模型
      const llama31Model = availableModelNames.find(name => name.includes('llama3.1'));
      if (llama31Model) {
        console.log(`✅ 使用找到的模型: ${llama31Model}`);
        this.model = llama31Model;
        return true;
      }
      
      // 检查是否有任何llama模型
      const llamaModel = availableModelNames.find(name => name.includes('llama'));
      if (llamaModel) {
        console.log(`✅ 使用备用Llama模型: ${llamaModel}`);
        this.model = llamaModel;
        return true;
      }
      
      // 检查是否有qwen模型
      const qwenModel = availableModelNames.find(name => name.includes('qwen'));
      if (qwenModel) {
        console.log(`✅ 使用备用Qwen模型: ${qwenModel}`);
        this.model = qwenModel;
        return true;
      }
      
      console.log('❌ 未找到任何兼容的AI模型');
      console.log('💡 建议安装以下模型之一:');
      console.log('   ollama pull llama3.1:latest');
      console.log('   ollama pull qwen2.5:7b');
      console.log('   ollama pull llama3.2:latest');
      return false;
    } catch (error) {
      console.error('❌ AI模型检查失败:', error.message);
      return false;
    }
  }

  // 提取文件内容 - 增强处理能力
  async extractFileContent(filePath, fileType) {
    try {
      let rawContent = '';
      
      switch (fileType.toLowerCase()) {
        case 'pdf':
          // 最强力的PDF解析警告屏蔽
          const originalConsoleWarn = console.warn;
          const originalProcessEmitWarning = process.emitWarning;
          const originalStderrWrite = process.stderr.write;
          
          // 完全屏蔽所有形式的警告输出
          console.warn = () => {}; // 完全不输出
          process.emitWarning = () => {}; // 完全不触发
          
          // 屏蔽stderr输出
          process.stderr.write = function(chunk, encoding, callback) {
            const text = chunk.toString();
            if (text.includes('font') || 
                text.includes('private use area') || 
                text.includes('Ran out of space')) {
              if (typeof callback === 'function') callback();
              return true;
            }
            return originalStderrWrite.call(this, chunk, encoding, callback);
          };
          
          try {
            // console.log('📄 开始解析PDF文件 (警告已完全屏蔽)...');
            const pdfBuffer = await fs.readFile(filePath);
            
            // 使用最安全的PDF解析选项
            const pdfData = await pdfParse(pdfBuffer, {
              max: 0,
              version: 'v1.10.100',
              normalizeWhitespace: true,
              disableCombineTextItems: false,
              // 添加更多选项来减少警告
              verbosity: 0, // 降低详细程度
              stdoutMaxBuffer: 1024 * 1024,
              normalizeUnicode: false // 减少字体处理
            });
            
            rawContent = pdfData.text;
            console.log(`✅ PDF解析完成，提取到 ${rawContent.length} 字符 (无警告输出)`);
            
            // 如果PDF内容为空或过少，尝试其他方法
            if (!rawContent || rawContent.trim().length < 50) {
              console.log('ℹ️ PDF文本内容较少，可能是扫描版或图片PDF');
              rawContent = `PDF文档已上传，但文本内容提取有限。

文档信息：
- 总页数: ${pdfData.numpages || '未知'}
- 文件大小: ${Math.round((pdfBuffer.length / 1024))} KB

建议：
1. 如果是扫描版PDF，请尝试上传文本版本
2. 如果包含图片内容，请提供文档描述
3. 可以手动输入主要内容进行学习

AI将基于可提取的内容为您创建学习材料。`;
            }
            
          } catch (pdfError) {
            console.error('PDF解析出错:', pdfError.message);
            // 提供备用内容
            rawContent = `PDF文档解析遇到问题，但文件已成功上传。

可能的原因：
- PDF文件包含复杂的字体或格式
- 文档采用了特殊的编码方式
- 文件可能包含主要为图片内容

AI将尝试为您创建基础的学习框架，您也可以：
1. 重新上传文本格式的文件
2. 提供文档的主要内容描述
3. 使用AI助手进行互动学习`;
          } finally {
            // 恢复原始函数
            console.warn = originalConsoleWarn;
            process.emitWarning = originalProcessEmitWarning;
            process.stderr.write = originalStderrWrite;
            // console.log('🔇 PDF警告屏蔽已移除，系统日志恢复正常');
          }
          break;
        

        
        case 'docx':
        case 'doc':
          console.log('📄 开始解析Word文档...');
          const docResult = await mammoth.extractRawText({ path: filePath });
          rawContent = docResult.value;
          console.log(`✅ Word文档解析完成，提取到 ${rawContent.length} 字符`);
          
          // 检查是否有警告
          if (docResult.messages && docResult.messages.length > 0) {
            const warnings = docResult.messages.filter(m => m.type === 'warning');
            if (warnings.length > 0) {
              console.log(`ℹ️ Word文档解析提示: ${warnings.length} 个格式转换提示`);
            }
          }
          break;
        
        case 'txt':
        case 'md':
          console.log('📄 开始读取文本文件...');
          rawContent = await fs.readFile(filePath, 'utf8');
          console.log(`✅ 文本文件读取完成，${rawContent.length} 字符`);
          break;
        
        default:
          throw new Error(`不支持的文件类型: ${fileType}`);
      }
      
      // 清理和规范化文本
      // const cleanedContent = this.cleanTextContent(rawContent);
      // console.log(`🧹 文本清理完成，从 ${rawContent.length} 字符清理为 ${cleanedContent.length} 字符`);
      
      return rawContent;
      
    } catch (error) {
      console.error('文件内容提取失败:', error);
      throw error;
    }
  }



  // 新增：文本清理函数
  cleanTextContent(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    return text
      // 移除控制字符和特殊字符
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // 统一换行符
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // 移除多余的空白字符
      .replace(/[ \t]+/g, ' ')
      // 规范化段落间距
      .replace(/\n{3,}/g, '\n\n')
      // 移除行首行尾空白
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      // 移除重复内容（简单去重）
      .replace(/(.{20,}?)\1+/g, '$1')
      .trim();
  }

  // 新增：强化的JSON清理函数
  cleanJSONString(jsonString) {
    if (!jsonString) return '';
    
    // 第一步：基础清理
    let cleaned = jsonString
      // 移除markdown代码块标记
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    // 第二步：定位JSON对象
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('未找到有效的JSON格式');
    }
    
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    
    // 第三步：字符级清理
    let result = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      const charCode = char.charCodeAt(0);
      
      if (escapeNext) {
        // 处理转义字符
        result += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escapeNext = true;
        result += char;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        result += char;
        continue;
      }
      
      if (inString) {
        // 在字符串内部，处理特殊字符
        if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
          // 跳过控制字符（保留制表符、换行符、回车符）
          continue;
        } else if (charCode === 10 || charCode === 13) {
          // 将换行符转换为\n
          result += '\\n';
          continue;
        } else if (charCode === 9) {
          // 将制表符转换为\t
          result += '\\t';
          continue;
        }
      }
      
      result += char;
    }
    
    return result;
  }

  // 新增：验证和修复JSON结构
  validateAndFixJSON(jsonString) {
    try {
      // 尝试直接解析
      return JSON.parse(jsonString);
    } catch (firstError) {
      console.log('🔧 JSON解析失败，尝试修复...');
      
      try {
        // 修复常见问题
        let fixed = jsonString
          // 移除尾随逗号
          .replace(/,(\s*[}\]])/g, '$1')
          // 修复单引号
          .replace(/'/g, '"')
          // 修复属性名没有引号的情况
          .replace(/(\w+):/g, '"$1":')
          // 修复多余的引号
          .replace(/"{2,}/g, '"')
          // 修复不匹配的括号（简单处理）
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        
        return JSON.parse(fixed);
      } catch (secondError) {
        console.log('🔧 基础修复失败，进行深度清理...');
        
        try {
          const deepCleaned = this.deepCleanJSON(jsonString);
          return JSON.parse(deepCleaned);
        } catch (thirdError) {
          console.error('❌ JSON修复彻底失败:', {
            original: firstError.message,
            fixed: secondError.message,
            deep: thirdError.message
          });
          throw new Error(`JSON格式修复失败: ${firstError.message}`);
        }
      }
    }  }

  // 🔧 新增：增强的JSON提取方法，支持重试机制
  extractAndCleanJSONWithRetry(responseContent, phase = 'AI分析') {
    if (!responseContent || typeof responseContent !== 'string') {
      throw new Error(`${phase}: 响应内容为空或不是字符串`);
    }
    
    console.log(`🔄 ${phase}: 开始JSON提取，尝试多种方法...`);
    
    // 方法1：直接使用标准提取方法
    try {
      return this.extractAndCleanJSON(responseContent);
    } catch (error1) {
      console.log(`🔄 ${phase}: 标准方法失败，尝试深度清理...`);
    }
    
    // 方法2：更激进的清理
    try {
      let cleaned = responseContent
        .replace(/```[\s\S]*?```/g, '') // 移除所有代码块
        .replace(/^[^{]*/, '') // 移除开头的非JSON内容
        .replace(/}[^}]*$/, '}') // 移除结尾的非JSON内容
        .trim();
      
      return this.extractAndCleanJSON(cleaned);
    } catch (error2) {
      console.log(`🔄 ${phase}: 深度清理失败，尝试正则提取...`);
    }
    
    // 方法3：正则表达式提取JSON
    try {
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return this.extractAndCleanJSON(jsonMatch[0]);
      }
    } catch (error3) {
      console.log(`🔄 ${phase}: 正则提取失败，尝试逐字符重建...`);
    }
    
    // 方法4：逐字符重建JSON
    try {
      const rebuilt = this.rebuildJSONFromContent(responseContent);
      return rebuilt;
    } catch (error4) {
      console.error(`❌ ${phase}: 所有JSON提取方法都失败了`);
      throw new Error(`${phase}: JSON提取彻底失败`);
    }
  }

  // 🔧 新增：逐字符重建JSON
  rebuildJSONFromContent(content) {
    let inJson = false;
    let braceCount = 0;
    let result = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (escapeNext) {
        if (inJson) result += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escapeNext = true;
        if (inJson) result += char;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        if (inJson) result += char;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          if (!inJson) inJson = true;
          braceCount++;
          result += char;
        } else if (char === '}') {
          braceCount--;
          result += char;
          if (braceCount === 0 && inJson) {
            break; // JSON完整结束
          }
        } else if (inJson) {
          result += char;
        }
      } else if (inJson) {
        result += char;
      }
    }
    
    if (braceCount !== 0) {
      throw new Error('JSON括号不匹配');
    }
    
    return this.fixCommonJSONIssues(result);
  }

  // 🔧 新增：带降级的JSON解析
  parseJSONWithFallback(jsonString, dataType = '数据') {
    console.log(`🔍 开始解析${dataType}JSON...`);
    
    // 尝试1：直接解析
    try {
      const parsed = JSON.parse(jsonString);
      console.log(`✅ ${dataType}JSON解析成功（直接解析）`);
      return parsed;
    } catch (error1) {
      console.log(`🔄 ${dataType}: 直接解析失败，尝试修复...`);
    }
    
    // 尝试2：基础修复后解析
    try {
      const fixed = this.fixCommonJSONIssues(jsonString);
      const parsed = JSON.parse(fixed);
      console.log(`✅ ${dataType}JSON解析成功（修复后）`);
      return parsed;
    } catch (error2) {
      console.log(`🔄 ${dataType}: 修复后解析失败，尝试深度修复...`);
    }
    
    // 尝试3：深度修复
    try {
      const deepFixed = this.deepFixJSON(jsonString);
      const parsed = JSON.parse(deepFixed);
      console.log(`✅ ${dataType}JSON解析成功（深度修复）`);
      return parsed;
    } catch (error3) {
      console.error(`❌ ${dataType}: 所有JSON解析方法都失败了`);
      throw new Error(`${dataType}JSON解析彻底失败: ${error1.message}`);
    }
  }

  // 🔧 新增：深度JSON修复
  deepFixJSON(jsonString) {
    let fixed = jsonString;
    
    // 修复常见的DeepSeek响应问题
    fixed = fixed
      // 移除解释性文字
      .replace(/^.*?(?=\{)/s, '')
      .replace(/\}.*$/s, '}')
      // 修复中文冒号
      .replace(/：/g, ':')
      // 修复中文逗号
      .replace(/，/g, ',')
      // 修复多余的换行和空格
      .replace(/\n\s*/g, ' ')
      // 修复属性值中的换行
      .replace(/"\s*\n\s*"/g, '\\n')
      // 修复未转义的引号
      .replace(/([^\\])"/g, '$1\\"')
      // 修复双引号重复
      .replace(/"{2,}/g, '"')
      // 修复尾随逗号
      .replace(/,(\s*[}\]])/g, '$1')
      // 修复缺失的逗号
      .replace(/"\s*"([a-zA-Z])/g, '", "$1')
      .replace(/"\s*\{/g, '", {')
      .replace(/\}\s*"/g, '}, "');
    
    return fixed;
  }

  // 🔧 新增：智能降级结构生成
  generateIntelligentFallbackStructure(content, fileName) {
    console.log('🧠 使用智能分析生成降级结构...');
    
    // 分析内容特征
    const contentLength = content.length;
    const sentences = content.split(/[。！？.!?]/).filter(s => s.trim().length > 10);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    
    // 提取关键词
    const keywords = this.extractKeywordsFromContent(content);
    const mainTopics = this.identifyMainTopics(content);
    
    // 智能判断内容复杂度
    let suggestedStageCount = 1;
    if (contentLength > 4000 || paragraphs.length > 6) suggestedStageCount = 4;
    else if (contentLength > 2000 || paragraphs.length > 3) suggestedStageCount = 3;
    else if (contentLength > 1000 || paragraphs.length > 1) suggestedStageCount = 2;
    
    return {
      documentAnalysis: {
        mainTopic: mainTopics[0] || `${fileName}核心内容`,
        coreContent: sentences.slice(0, 3).join('。') || '文档包含重要学习内容',
        keyAreas: keywords.slice(0, 4),
        suggestedStageCount: suggestedStageCount,
        stageRationale: `基于文档长度(${contentLength}字符)和段落数(${paragraphs.length}个)的智能分析`
      },
      summary: `《${fileName}》${this.generateSmartSummary(content)}`,
      keyPoints: this.extractSmartKeyPoints(content),
      topics: mainTopics.slice(0, 3)
    };
  }

  // 🔧 新增：从内容提取关键词
  extractKeywordsFromContent(content) {
    // 提取中文关键词
    const chineseWords = content.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    const wordFreq = {};
    
    chineseWords.forEach(word => {
      if (word.length >= 2 && !this.isCommonWord(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([word]) => word);
  }

  // 🔧 新增：识别主要主题
  identifyMainTopics(content) {
    const topics = [];
    
    // 查找明显的主题标识
    const titleMatches = content.match(/(?:第[一二三四五六七八九十\d]+[章节部分]|[一二三四五六七八九十\d]+[、.])\s*([^\n]{4,20})/g);
    if (titleMatches) {
      topics.push(...titleMatches.map(match => match.replace(/^[第一二三四五六七八九十\d、.]*\s*/, '').trim()));
    }
    
    // 如果没有明显标题，从关键词推导
    if (topics.length === 0) {      const keywords = this.extractKeywordsFromContent(content);
      if (keywords.length > 0) {
        topics.push(keywords.slice(0, 2).join('与'));
      }
    }
    
    return topics.slice(0, 10); // 返回前10个主题
  }

  // 🔧 新增：检查是否为常见词
  isCommonWord(word) {
    const commonWords = ['我们', '可以', '需要', '应该', '这个', '那个', '因为', '所以', '但是', '如果', '虽然', '然而', '不是', '就是', '什么', '怎么', '为什么', '怎样', '这样', '那样'];
    return commonWords.includes(word);
  }

  // 🔧 新增：生成智能摘要
  generateSmartSummary(content) {
    const sentences = content.split(/[。！？.!?]/).filter(s => s.trim().length > 15);
    const firstSentence = sentences[0] || '';
    const keyInfo = this.extractKeywordsFromContent(content).slice(0, 3).join('、');
    
    if (firstSentence.length > 50) {
      return `主要介绍${keyInfo}等内容，${firstSentence.substring(0, 50)}...`;
    } else {
      return `涵盖${keyInfo}等重要内容，为学习者提供系统化的知识体系。`;
    }
  }

  // 🔧 新增：提取智能关键点
  extractSmartKeyPoints(content) {
    const sentences = content.split(/[。！？.!?]/).filter(s => s.trim().length > 20 && s.trim().length < 100);
    const keywords = this.extractKeywordsFromContent(content);
    
    const keyPoints = [];
    
    // 基于关键词生成要点
    keywords.slice(0, 3).forEach(keyword => {
      const relevantSentence = sentences.find(s => s.includes(keyword));
      if (relevantSentence) {
        keyPoints.push(`掌握${keyword}的相关知识：${relevantSentence.trim()}`);
      } else {
        keyPoints.push(`理解和应用${keyword}的核心概念`);
      }
    });
    
    // 补充通用要点
    if (keyPoints.length < 4) {
      keyPoints.push('全面理解文档核心内容');
      keyPoints.push('掌握重要概念和方法');
    }
    
    return keyPoints.slice(0, 5);
  }

  // 新增：深度JSON清理
  deepCleanJSON(jsonString) {
    // 逐字符重建JSON
    let result = '';
    let inString = false;
    let escapeNext = false;
    let braceCount = 0;
    let bracketCount = 0;
    
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      
      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escapeNext = true;
        result += char;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;
      }
      
      // 在字符串内部时，清理控制字符
      if (inString && char.charCodeAt(0) < 32) {
        if (char === '\n' || char === '\r') {
          result += '\\n';
        } else if (char === '\t') {
          result += '\\t';
        }
        // 跳过其他控制字符
        continue;
      }
      
      result += char;
    }
    
    return result;
  }
  // 🔧 大幅改进：让AI真正分析内容并智能决定学习阶段划分
  async analyzeContent(content, fileName, selectedModel = 'local') {
    // 🔧 使用队列化请求
    return await this.queuedAIRequest(async () => {
      // 验证内容质量
      const cleanContent = this.cleanTextContent(content);
      
      if (!cleanContent || cleanContent.length < 50) {
        throw new Error('文档内容太少或无法提取有效内容');
      }
      
      console.log(`📊 开始AI智能分析文档: ${fileName}，使用模型: ${selectedModel}`);
      console.log(`📄 内容长度: ${cleanContent.length} 字符`);
      console.log(`📝 内容预览: ${cleanContent.substring(0, 200)}...`);
      
      // 🔧 改进：分两个阶段进行AI分析，第一阶段分析内容结构，第二阶段生成学习阶段
        // 第一阶段：内容结构分析
      const structureAnalysisPrompt = `你是一位专业的教育内容分析师。请仔细分析以下文档，专注于提取核心知识点和实际内容，避免生成通用性描述。

文档：${fileName}
内容长度：${cleanContent.length} 字符

=== 文档内容 ===
${cleanContent}
=== 内容结束 ===

请深度分析文档的实际内容，重点关注：
1. 文档包含哪些具体的知识、概念、技能或信息
2. 这些内容的重要性和学习难度层次
3. 内容之间的逻辑关系和依赖性
4. 如何划分学习阶段才能确保学习效果

返回JSON格式分析结果：
{
  "documentAnalysis": {
    "mainTopic": "文档的具体主题（基于实际内容）",
    "coreContent": "文档的核心内容概要（提取关键信息）",
    "keyAreas": ["具体知识点1", "具体知识点2", "具体知识点3"],
    "learningDifficulty": "基于内容复杂度的难度评估",
    "suggestedStageCount": 学习阶段数量（1-5，基于内容逻辑），
    "stageRationale": "基于内容特点的划分理由"
  },
  "summary": "基于文档实际内容的精准概述，突出核心价值",
  "keyPoints": [
    "文档中的具体知识点1",
    "文档中的具体知识点2", 
    "文档中的具体知识点3",
    "文档中的具体知识点4",
    "文档中的具体知识点5"
  ],
  "topics": ["实际涉及的主题1", "实际涉及的主题2"]
}

要求：
- 所有分析必须基于文档的实际内容，不要添加文档中没有的信息
- 重点提取具体的、可学习的知识点
- 避免使用模糊的通用描述
- 确保keyPoints都是文档中明确提到的内容`;      console.log(`🤖 第一阶段：使用模型 ${selectedModel === 'deepseek' ? 'DeepSeek' : this.model} 进行内容结构分析...`);
      
      let structureResponse;
      if (selectedModel === 'deepseek') {
        try {          // 使用 DeepSeek API - 需要特殊的JSON格式提示
          const deepseekPrompt = `${structureAnalysisPrompt}

**重要说明**：请严格按照以下要求返回：
1. 直接返回JSON对象，不要任何前缀文字或解释
2. 不要使用markdown代码块标记
3. 确保JSON格式完全正确，所有引号都要匹配
4. 数字类型不要加引号，字符串类型必须加引号
5. 数组中的每个元素都要用引号包围

示例正确格式：
{
  "documentAnalysis": {
    "mainTopic": "具体主题",
    "coreContent": "核心内容",
    "keyAreas": ["知识点1", "知识点2"],
    "learningDifficulty": "中级",
    "suggestedStageCount": 3,
    "stageRationale": "划分理由"
  },
  "summary": "文档概述",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "topics": ["主题1", "主题2"]
}

现在请直接返回上述格式的JSON，不要添加任何其他内容：`;
          const deepseekService = require('./deepseekService');
          structureResponse = await deepseekService.generateCompletion(deepseekPrompt);
        } catch (deepseekError) {
          console.error('❌ DeepSeek第一阶段调用失败，降级到本地模型:', deepseekError.message);
          // 降级到本地模型
          structureResponse = await this.ollama.chat({
            model: this.model,
            messages: [{ role: 'user', content: structureAnalysisPrompt }],
            stream: false,
            options: {
              temperature: 0.1,
              num_ctx: 16384,
              num_predict: 2000,
              top_p: 0.7,
              repeat_penalty: 1.1
            }
          });
        }
      } else {
        // 使用本地模型
        structureResponse = await this.ollama.chat({
          model: this.model,
          messages: [{ role: 'user', content: structureAnalysisPrompt }],
          stream: false,
          options: {
            temperature: 0.1,
            num_ctx: 16384,
            num_predict: 2000,
            top_p: 0.7,
            repeat_penalty: 1.1
          }
        });
      }      console.log('🔍 第一阶段分析完成，解析结构分析结果...');      
      let structureData;
      let responseContent; // 将responseContent变量提升到外层作用域
      try {
        // 检查是否为本地模型响应格式（有message.content属性）
        if (structureResponse && structureResponse.message && structureResponse.message.content) {
          responseContent = structureResponse.message.content;
        } else {
          // DeepSeek响应或字符串响应
          responseContent = structureResponse;
        }        
        console.log('📝 第一阶段原始响应长度:', responseContent?.length || 0);
        console.log('📄 第一阶段响应预览:', responseContent?.substring(0, 300) || '无响应内容');
        
        // 增强的JSON提取容错
        const structureJsonContent = this.extractAndCleanJSONWithRetry(responseContent, '第一阶段结构分析');
        console.log('🧹 清理后的JSON长度:', structureJsonContent.length);
        console.log('🔍 清理后的JSON预览:', structureJsonContent.substring(0, 200));
        
        structureData = this.parseJSONWithFallback(structureJsonContent, '结构分析');
        console.log('✅ 结构分析结果解析成功');
      } catch (structureError) {
        console.error('❌ 结构分析解析失败，详细错误:', structureError.message);
        console.error('❌ 失败的原始响应:', responseContent?.substring(0, 500) || 'undefined');
        console.log('🔄 使用内容智能分析生成默认结构');
        structureData = this.generateIntelligentFallbackStructure(cleanContent, fileName);
      }

      const suggestedStageCount = Math.max(1, Math.min(6, structureData.documentAnalysis.suggestedStageCount || 3));
      console.log(`📊 AI建议划分为 ${suggestedStageCount} 个学习阶段：${structureData.documentAnalysis.stageRationale}`);      // 第二阶段：基于结构分析生成具体的学习阶段
      const stageGenerationPrompt = `基于前期分析，现在请为文档创建 ${suggestedStageCount} 个高质量学习阶段。重点是提取和重组文档中的实际内容，避免添加文档中没有的信息。

分析结果：
- 主题：${structureData.documentAnalysis.mainTopic || '文档学习内容'}
- 核心内容：${structureData.documentAnalysis.coreContent || '文档重要内容'}
- 关键知识点：${structureData.documentAnalysis.keyAreas ? structureData.documentAnalysis.keyAreas.join('、') : '核心知识点'}

=== 文档内容 ===
${cleanContent}
=== 内容结束 ===

请将文档内容重组为 ${suggestedStageCount} 个学习阶段，要求：

1. 每个阶段包含文档中的具体内容片段
2. 重新组织内容使其更适合学习，但保持原始信息准确性
3. 避免添加文档中没有的通用知识
4. 确保内容的实用性和针对性

JSON格式：
{
  "learningStages": [
    {
      "stage": 1,
      "title": "基于文档实际内容的阶段标题",
      "content": "【学习目标】\\n明确且具体的学习目标（基于文档内容）\\n\\n【核心内容】\\n[直接引用并解释文档中的具体内容，包括重要的定义、概念、数据、步骤等]\\n\\n【重点掌握】\\n[从文档中提取的需要重点掌握的具体知识点]\\n\\n【实际应用】\\n[如果文档中提到具体应用，则说明；否则基于内容推导合理应用]",
      "keyPoints": ["文档中该部分的具体要点1", "文档中该部分的具体要点2", "文档中该部分的具体要点3"],
      "contentSection": "对应文档中的内容范围"
    }
  ]
}

关键要求：
1. 内容必须来源于文档，不要编造信息
2. 重点突出文档中的具体知识、技能或信息
3. 学习目标要具体、可衡量
4. keyPoints必须是文档中明确提到的内容
5. 避免使用"了解"、"理解"等模糊表述，要具体说明学什么`;      console.log(`🤖 第二阶段：使用模型 ${selectedModel === 'deepseek' ? 'DeepSeek' : this.model} 生成 ${suggestedStageCount} 个具体学习阶段...`);
      
      let stageResponse;
      if (selectedModel === 'deepseek') {
        try {          // 使用 DeepSeek API - 需要特殊的JSON格式提示
          const deepseekStagePrompt = `${stageGenerationPrompt}

**重要说明**：请严格按照以下要求返回：
1. 直接返回JSON对象，不要任何前缀文字或解释
2. 不要使用markdown代码块标记
3. 确保JSON格式完全正确，所有引号都要匹配
4. 必须包含learningStages数组
5. 每个阶段都要有完整的字段

示例正确格式：
{
  "learningStages": [
    {
      "stage": 1,
      "title": "阶段标题",
      "content": "学习内容",
      "keyPoints": ["要点1", "要点2"],
      "contentSection": "内容范围"
    }
  ]
}

现在请直接返回上述格式的JSON，不要添加任何其他内容：`;
          const deepseekService = require('./deepseekService');
          stageResponse = await deepseekService.generateCompletion(deepseekStagePrompt);
        } catch (deepseekError) {
          console.error('❌ DeepSeek第二阶段调用失败，降级到本地模型:', deepseekError.message);
          // 降级到本地模型
          stageResponse = await this.ollama.chat({
            model: this.model,
            messages: [{ role: 'user', content: stageGenerationPrompt }],
            stream: false,
            options: {
              temperature: 0.1,
              num_ctx: 16384,
              num_predict: 4000,
              top_p: 0.7,
              repeat_penalty: 1.1
            }
          });
        }
      } else {
        // 使用本地模型
        stageResponse = await this.ollama.chat({
          model: this.model,
          messages: [{ role: 'user', content: stageGenerationPrompt }],
          stream: false,
          options: {
            temperature: 0.1,
            num_ctx: 16384,
            num_predict: 4000,
            top_p: 0.7,
            repeat_penalty: 1.1
          }
        });
      }      console.log('🔍 第二阶段分析完成，解析学习阶段...');      
      // 解析第二阶段结果
      let stageData;
      let stageResponseContent; // 为第二阶段定义独立的变量名
      try {
        // 检查是否为本地模型响应格式（有message.content属性）
        if (stageResponse && stageResponse.message && stageResponse.message.content) {
          stageResponseContent = stageResponse.message.content;
        } else {
          // DeepSeek响应或字符串响应
          stageResponseContent = stageResponse;
        }        
        console.log('📝 第二阶段原始响应长度:', stageResponseContent?.length || 0);
        console.log('📄 第二阶段响应预览:', stageResponseContent?.substring(0, 300) || '无响应内容');
        
        // 增强的JSON提取容错
        const stageJsonContent = this.extractAndCleanJSONWithRetry(stageResponseContent, '第二阶段学习阶段');
        console.log('🧹 第二阶段清理后的JSON长度:', stageJsonContent.length);
        console.log('🔍 第二阶段清理后的JSON预览:', stageJsonContent.substring(0, 200));
        
        stageData = this.parseJSONWithFallback(stageJsonContent, '学习阶段');
        console.log('✅ 学习阶段解析成功');
      } catch (stageError) {
        console.error('❌ 学习阶段解析失败，详细错误:', stageError.message);
        console.error('❌ 失败的原始响应:', stageResponseContent?.substring(0, 500) || 'undefined');
        console.log('🔄 生成基于内容的智能默认阶段');
        stageData = {
          learningStages: this.generateContentBasedStages(cleanContent, fileName, suggestedStageCount)
        };
      }

      // 验证并增强学习阶段
      const enhancedStages = this.validateAndEnhanceStages(
        stageData.learningStages || [], 
        cleanContent, 
        fileName,
        suggestedStageCount
      );

      const finalResult = {
        summary: structureData.summary,
        keyPoints: this.validateKeyPoints(structureData.keyPoints, cleanContent),
        topics: this.validateTopics(structureData.topics, cleanContent),
        // 🔧 移除难度和时间估算
        learningStages: enhancedStages,
        // 新增：分析元数据
        analysisMetadata: {
          documentAnalysis: structureData.documentAnalysis,
          aiGenerated: true,
          analysisTimestamp: new Date().toISOString()
        }
      };      console.log(`✅ AI智能分析完成，生成 ${enhancedStages.length} 个学习阶段`);
      return finalResult;

    }, `内容分析-${fileName}`);
  }

  // 🔧 新增：提取和清理JSON的改进方法
  extractAndCleanJSON(responseContent) {
    if (!responseContent || typeof responseContent !== 'string') {
      throw new Error('响应内容为空或不是字符串');
    }
    
    let jsonContent = responseContent.trim();
    console.log('🔍 开始JSON提取，原始长度:', jsonContent.length);
    
    // 第一步：移除常见的非JSON内容
    // 移除markdown代码块标记
    jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // 移除常见的前缀文字
    jsonContent = jsonContent.replace(/^.*?(?=\{)/s, '');
    
    // 移除后缀文字（在最后一个}之后的内容）
    const lastBraceIndex = jsonContent.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      jsonContent = jsonContent.substring(0, lastBraceIndex + 1);
    }
    
    console.log('🧹 清理后长度:', jsonContent.length);
    console.log('📄 清理后内容预览:', jsonContent.substring(0, 200));
    
    // 第二步：查找JSON对象的精确边界
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.error('❌ 未找到有效的JSON边界');
      console.error('jsonStart:', jsonStart, 'jsonEnd:', jsonEnd);
      console.error('内容:', jsonContent.substring(0, 100));
      throw new Error('未找到有效的JSON格式');
    }
    
    jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    console.log('✂️ 提取JSON内容长度:', jsonContent.length);
    
    // 第三步：修复常见的JSON格式问题
    jsonContent = this.fixCommonJSONIssues(jsonContent);
    
    return jsonContent;
  }

  // 新增：修复常见的JSON格式问题
  fixCommonJSONIssues(jsonString) {
    let fixed = jsonString;
    
    // 修复尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 修复单引号为双引号
    fixed = fixed.replace(/'([^']*?)'/g, '"$1"');
    
    // 修复属性名没有引号的问题
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // 修复多行字符串问题（将实际换行符转换为\n）
    fixed = fixed.replace(/"\s*\n\s*"/g, '\\n');
    
    console.log('🔧 JSON修复完成');
    return fixed;
  }

  // 🔧 改进：验证和增强学习阶段
  validateAndEnhanceStages(stages, originalContent, fileName, targetStageCount) {
    if (!stages || stages.length === 0) {
      console.log('⚠️ AI未生成有效学习阶段，使用基于内容的生成方法');
      return this.generateContentBasedStages(originalContent, fileName, targetStageCount);
    }

    console.log(`🔍 验证 ${stages.length} 个AI生成的学习阶段...`);

    const validatedStages = stages.map((stage, index) => {
      // 确保每个阶段都有完整的结构
      const enhancedStage = {
        stage: index + 1,
        title: stage.title || `第${index + 1}阶段：${fileName}学习`,
        content: this.enhanceStageContent(stage.content, originalContent, index, stages.length, fileName),
        keyPoints: Array.isArray(stage.keyPoints) && stage.keyPoints.length > 0 ? 
          stage.keyPoints : 
          this.extractKeyPointsFromContent(originalContent, index, stages.length),
        contentSection: stage.contentSection || `第${index + 1}部分内容`
      };

      return enhancedStage;
    });

    // 如果阶段数量不符合预期，进行调整
    if (validatedStages.length !== targetStageCount) {
      console.log(`⚠️ 阶段数量不匹配（生成${validatedStages.length}个，期望${targetStageCount}个），进行调整...`);
      return this.adjustStageCount(validatedStages, originalContent, fileName, targetStageCount);
    }

    console.log(`✅ 学习阶段验证完成，共 ${validatedStages.length} 个阶段`);
    return validatedStages;
  }

  // 🔧 新增：增强阶段内容
  enhanceStageContent(aiContent, originalContent, stageIndex, totalStages, fileName) {
    // 如果AI生成的内容过短，用原始内容补充
    if (!aiContent || aiContent.length < 200) {
      console.log(`⚠️ 第${stageIndex + 1}阶段AI内容过短，使用原始内容补充`);
      
      // 计算这个阶段对应的原始内容部分
      const sectionStart = Math.floor((stageIndex / totalStages) * originalContent.length);
      const sectionEnd = Math.floor(((stageIndex + 1) / totalStages) * originalContent.length);
      const sectionContent = originalContent.substring(sectionStart, sectionEnd);
      
      return this.formatStageContent(sectionContent, stageIndex + 1, fileName);
    }

    // 如果AI内容存在但可能需要格式化
    if (aiContent && !aiContent.includes('【学习目标】')) {
      return this.formatStageContent(aiContent, stageIndex + 1, fileName);
    }

    return aiContent;
  }

  // 🔧 新增：格式化阶段内容
  formatStageContent(content, stageNumber, fileName) {
    // 提取内容的关键句子
    const sentences = content.split(/[。！？.!?]/)
      .filter(s => s.trim().length > 20)
      .slice(0, 8);

    const formattedContent = `【学习目标】
第${stageNumber}阶段，我们将学习《${fileName}》中的重要内容，理解其核心概念和应用方法。

【核心内容】
${sentences.slice(0, 4).join('。')}

【重点理解】
${sentences.slice(4, 6).join('。')}

【学习指导】
本阶段内容需要仔细理解，重点掌握上述核心概念。建议：
1. 仔细阅读每个要点，理解其含义
2. 思考这些内容与实际应用的关系
3. 如有疑问，随时向AI助手提问

${sentences.slice(6).length > 0 ? '\n【补充说明】\n' + sentences.slice(6).join('。') : ''}`;

    return formattedContent;
  }

  // 🔧 新增：调整阶段数量
  adjustStageCount(currentStages, originalContent, fileName, targetCount) {
    if (currentStages.length === targetCount) {
      return currentStages;
    }

    if (currentStages.length > targetCount) {
      // 合并多余的阶段
      console.log(`🔧 合并阶段：从${currentStages.length}个合并为${targetCount}个`);
      return this.mergeStages(currentStages, targetCount);
    } else {
      // 拆分阶段以达到目标数量
      console.log(`🔧 拆分阶段：从${currentStages.length}个拆分为${targetCount}个`);
      return this.generateContentBasedStages(originalContent, fileName, targetCount);
    }
  }

  // 🔧 新增：合并阶段
  mergeStages(stages, targetCount) {
    const mergedStages = [];
    const stagesPerMerged = Math.ceil(stages.length / targetCount);

    for (let i = 0; i < targetCount; i++) {
      const startIdx = i * stagesPerMerged;
      const endIdx = Math.min(startIdx + stagesPerMerged, stages.length);
      const stagesToMerge = stages.slice(startIdx, endIdx);

      const mergedStage = {
        stage: i + 1,
        title: stagesToMerge.length === 1 ? 
          stagesToMerge[0].title : 
          `第${i + 1}阶段：综合学习`,
        content: stagesToMerge.map(s => s.content).join('\n\n'),
        keyPoints: stagesToMerge.reduce((all, s) => [...all, ...s.keyPoints], []),
        contentSection: stagesToMerge.map(s => s.contentSection).join('、')
      };

      mergedStages.push(mergedStage);
    }

    return mergedStages;
  }

  // 🔧 改进：生成基于内容的学习阶段（AI智能版本）
  generateContentBasedStages(content, fileName, stageCount = null) {
    console.log('🔧 生成基于内容的智能学习阶段...');
    
    // 如果没有指定阶段数，智能决定
    if (!stageCount) {
      stageCount = this.determineOptimalStageCount(content);
    }
    
    const stages = [];
    
    // 分析内容的自然段落和重要转折点
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    const sentences = content.split(/[。！？.!?]/).filter(s => s.trim().length > 20);
    
    for (let i = 0; i < stageCount; i++) {
      // 计算这个阶段的内容范围
      const stageStart = Math.floor((i / stageCount) * content.length);
      const stageEnd = Math.floor(((i + 1) / stageCount) * content.length);
      const stageContent = content.substring(stageStart, stageEnd);
      
      // 找到最接近的段落边界
      const adjustedContent = this.findNaturalBreakpoint(content, stageStart, stageEnd);
      
      stages.push({
        stage: i + 1,
        title: `第${i + 1}阶段：${fileName}${this.getStageTitle(i, stageCount)}`,
        content: this.formatStageContent(adjustedContent, i + 1, fileName),
        keyPoints: this.extractKeyPointsFromContent(adjustedContent, i, stageCount),
        contentSection: `第${i + 1}部分：${this.getContentSectionDescription(adjustedContent)}`
      });
    }
    
    return stages;
  }

  // 🔧 新增：找到自然的分段点
  findNaturalBreakpoint(content, idealStart, idealEnd) {
    // 在理想位置附近寻找自然的段落分界点
    const searchRange = Math.min(200, (idealEnd - idealStart) * 0.1);
    
    // 寻找段落分界
    let adjustedStart = idealStart;
    let adjustedEnd = idealEnd;
    
    // 向前寻找段落开始
    for (let i = idealStart; i >= Math.max(0, idealStart - searchRange); i--) {
      if (content[i] === '\n' && content[i + 1] !== '\n') {
        adjustedStart = i + 1;
        break;
      }
    }
    
    // 向后寻找段落结束
    for (let i = idealEnd; i <= Math.min(content.length, idealEnd + searchRange); i++) {
      if (content[i] === '。' || content[i] === '！' || content[i] === '？') {
        adjustedEnd = i + 1;
        break;
      }
    }
    
    return content.substring(adjustedStart, adjustedEnd).trim();
  }

  // 🔧 新增：获取内容区域描述
  getContentSectionDescription(content) {
    // 提取内容的前几个关键词作为描述
    const keywords = content.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
    const topKeywords = [...new Set(keywords)].slice(0, 3);
    return topKeywords.length > 0 ? topKeywords.join('、') + '等内容' : '相关内容';
  }

  // 🔧 改进：智能确定最佳学习阶段数量
  determineOptimalStageCount(content) {
    if (!content || content.length < 100) {
      return 1;
    }
    
    const contentLength = content.length;
    const paragraphCount = content.split(/\n\s*\n/).filter(p => p.trim().length > 50).length;
    const sectionCount = (content.match(/第[一二三四五六七八九十\d]+[章节部分]/g) || []).length;
    
    // 综合考虑多个因素
    let suggestedStages = 1;
    
    // 基于内容长度
    if (contentLength > 5000) suggestedStages = 4;
    else if (contentLength > 3000) suggestedStages = 3;
    else if (contentLength > 1500) suggestedStages = 2;
    else suggestedStages = 1;
    
    // 基于段落数量调整
    if (paragraphCount > 8) suggestedStages = Math.max(suggestedStages, 3);
    else if (paragraphCount > 4) suggestedStages = Math.max(suggestedStages, 2);
    
    // 基于明显的章节结构调整
    if (sectionCount > 0) {
      suggestedStages = Math.min(Math.max(suggestedStages, sectionCount), 6);
    }
    
    // 最终限制在1-6之间
    return Math.max(1, Math.min(6, suggestedStages));
  }

  // 🔧 新增：验证关键要点的相关性
  validateKeyPoints(keyPoints, originalContent) {
    if (!keyPoints || !Array.isArray(keyPoints)) {
      return this.extractKeyPointsFromContent(originalContent);
    }
    
    // 过滤掉过于通用的要点，优先保留具体的
    const validPoints = keyPoints.filter(point => 
      point && 
      point.length > 10 && 
      point.length < 200 &&
      !point.includes('AI分析中') &&
      !point.includes('请稍后重试')
    );
    
    if (validPoints.length < 3) {
      return [...validPoints, ...this.extractKeyPointsFromContent(originalContent)].slice(0, 5);
    }
    
    return validPoints.slice(0, 5);
  }

  // 🔧 新增：验证主题的相关性
  validateTopics(topics, originalContent) {
    if (!topics || !Array.isArray(topics)) {
      return this.extractTopicsFromContent(originalContent);
    }
    
    const validTopics = topics.filter(topic => 
      topic && 
      topic.length > 2 && 
      topic.length < 50
    );
    
    if (validTopics.length === 0) {
      return this.extractTopicsFromContent(originalContent);
    }
    
    return validTopics.slice(0, 3);
  }

  // 🔧 新增：从原始内容提取关键要点
  extractKeyPointsFromContent(content, stageIndex = 0, totalStages = 1) {
    if (!content || content.length < 100) {
      return ['内容分析中', '请等待处理完成'];
    }
    
    // 按句子分割，寻找信息量大的句子
    const sentences = content.split(/[。！？.!?]\s*/)
      .filter(sentence => sentence.length > 20 && sentence.length < 150)
      .map(sentence => sentence.trim())
      .filter(sentence => {
        // 过滤掉过于简单的句子
        return sentence.length > 0 && 
               !sentence.includes('如下') && 
               !sentence.includes('见附件') &&
               sentence.split('').filter(char => /[\u4e00-\u9fa5a-zA-Z0-9]/.test(char)).length > 10;
      });
    
    // 选择最有信息量的句子
    const informativeSentences = sentences
      .sort((a, b) => {
        // 优先选择包含关键词的句子
        const keywordScore = (sentence) => {
          const keywords = ['方法', '步骤', '原则', '要求', '标准', '规定', '目标', '意义', '作用'];
          return keywords.reduce((score, keyword) => score + (sentence.includes(keyword) ? 1 : 0), 0);
        };
        return keywordScore(b) - keywordScore(a);
      })
      .slice(0, 3);
    
    return informativeSentences.length > 0 ? informativeSentences : 
           ['文档内容已加载', '等待详细分析', '请查看学习阶段内容'];
  }

  // 🔧 新增：从内容提取主题
  extractTopicsFromContent(content) {
    if (!content || content.length < 100) {
      return ['学习内容'];
    }
    
    // 常见主题关键词
    const topicKeywords = {
      '技术': ['技术', '系统', '软件', '硬件', '网络', '数据库', '编程'],
      '管理': ['管理', '流程', '制度', '规范', '标准', '质量'],
      '培训': ['培训', '学习', '教育', '教学', '课程', '知识'],
      '安全': ['安全', '防护', '风险', '保护', '监控'],
      '政策': ['政策', '法规', '条例', '规定', '办法'],
      '操作': ['操作', '使用', '步骤', '方法', '指南'],
      '项目': ['项目', '计划', '方案', '实施', '执行'],
      '财务': ['财务', '预算', '成本', '费用', '资金']
    };
    
    const foundTopics = [];
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matchCount = keywords.reduce((count, keyword) => {
        return count + (content.split(keyword).length - 1);
      }, 0);
      
      if (matchCount > 0) {
        foundTopics.push({ topic, count: matchCount });
      }
    }
    
    // 按匹配次数排序，取前3个
    const sortedTopics = foundTopics
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.topic);
    
    return sortedTopics.length > 0 ? sortedTopics : ['综合学习'];
  }

  // 🔧 新增：生成基于内容的备用分析
  generateContentBasedFallback(content, fileName) {
    console.log('🔧 生成基于内容的详细备用分析...');
    
    const stageCount = this.determineOptimalStageCount(content);
    const keywords = this.extractKeywords(content);
    const keyPoints = this.extractKeyPointsFromContent(content);
    
    return {
      summary: this.enhanceAnalysisSummary(null, fileName, content),
      keyPoints: keyPoints,
      topics: this.extractTopicsFromContent(content),
      learningStages: this.generateContentBasedStages(content, fileName, stageCount),
      // 新增：分析元数据
      analysisMetadata: {
        aiGenerated: false,
        fallbackMethod: 'content-based',
        analysisTimestamp: new Date().toISOString()
      }
    };
  }

  // 🔧 新增：增强分析摘要
  enhanceAnalysisSummary(aiSummary, fileName, content) {
    if (!aiSummary || aiSummary.length < 50) {
      // 基于内容生成更准确的摘要
      const contentStart = content.substring(0, 500);
      const contentKeywords = this.extractKeywords(content);
      
      return `《${fileName}》是一份包含${Math.ceil(content.length / 500)}个主要部分的文档，主要涉及${contentKeywords.slice(0, 3).join('、')}等内容。` +
             `文档内容丰富，通过系统化学习可以全面掌握相关知识和技能。` +
             `内容概要：${contentStart.replace(/\n+/g, ' ').substring(0, 200)}...`;
    }
    
    return aiSummary;
  }

  // 🔧 新增：提取关键词
  extractKeywords(content) {
    // 使用简单的词频分析提取关键词
    const words = content.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
    const wordCount = {};
    
    words.forEach(word => {
      if (word.length >= 2 && word.length <= 8) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
    
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => entry[0]);
  }

  // 🔧 新增：获取阶段标题
  getStageTitle(index, total) {
    if (total === 1) return '完整内容学习';
    if (index === 0) return '基础内容与概念';
    if (index === total - 1) return '总结与应用';
    return `核心内容学习${index}`;
  }

  // 🏷️ 新增：专门为标签生成测试题目的方法
  async generateTagQuestions(tagId, questionCount = 8) {
    try {
      console.log(`🏷️ 开始为标签${tagId}生成${questionCount}道题目...`);
      
      // 获取标签信息和学习内容
      const database = require('../database/database');
      const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
      
      if (!tag) {
        throw new Error(`标签${tagId}不存在`);
      }
      
      // 获取标签的学习内容
      const learningContent = database.tags.getTagLearningContent(tagId);
      if (!learningContent) {
        throw new Error(`标签"${tag.name}"还没有生成学习内容`);
      }
      
      // 解析学习内容
      let mergedContent = learningContent.merged_content || '';
      let aiAnalysis = {};
      
      try {
        aiAnalysis = JSON.parse(learningContent.ai_analysis || '{}');
      } catch (parseError) {
        console.warn('解析AI分析失败:', parseError);
      }
      
      // 🔧 修复：如果没有合并内容，尝试从文件中获取
      if (!mergedContent || mergedContent.length < 100) {
        console.log(`🔄 标签"${tag.name}"的合并内容不足，从原始文件获取内容...`);
        
        // 获取标签下的文件
        const tagFiles = database.tags.getTagFiles(tagId);
        const uploadModule = require('../routes/upload');
        const { fileDatabase } = uploadModule;
        
        // 收集所有文件的内容
        let collectedContent = '';
        for (const tagFile of tagFiles) {
          const file = fileDatabase.find(f => f.id === tagFile.file_id);
          if (file && file.status === 'completed' && file.content) {
            collectedContent += `\n\n=== 文档：${file.originalName} ===\n${file.content}`;
          }
        }
        
        if (collectedContent.length > 100) {
          mergedContent = collectedContent;
          console.log(`✅ 从${tagFiles.length}个文件收集到${mergedContent.length}字符的内容`);
        } else {
          throw new Error(`标签"${tag.name}"下没有足够的内容用于生成题目`);
        }
      }
      
      console.log(`📚 使用标签"${tag.name}"的学习内容，长度: ${mergedContent.length}字符`);
      
      // 🔧 修复：使用专门的标签题目生成方法
      const questions = await this.generateQuestions(
        mergedContent,
        1, // 标签测试使用综合阶段
        '中级',
        questionCount
      );
      
      // 为标签题目添加额外信息
      if (questions && questions.questions) {
        questions.questions = questions.questions.map(q => ({
          ...q,
          isTagQuestion: true,
          tagId: tagId,
          tagName: tag.name,
          sourceFiles: [tag.name] // 标记来源
        }));
      }
      
      console.log(`✅ 标签"${tag.name}"题目生成成功: ${questions?.questions?.length || 0}道题目`);
      return questions;
      
    } catch (error) {
      console.error('❌ 标签题目生成失败:', error);
      throw error;
    }
  }  // 🔧 改进：确保真正深入分析内容的题目生成
  async generateQuestions(content, stage, difficulty = '中級', questionCount = 5, selectedModel = 'local') {
    // 🔧 判断是否为综合测试（stage为1且内容较长）
    const isComprehensiveTest = stage === 1 && content && content.length > 1000;
    const testType = isComprehensiveTest ? '综合评估测试' : `第${stage}阶段测试`;
    
    // 🤖 检查是否使用DeepSeek
    if (selectedModel === 'deepseek') {
      console.log(`🤖 使用DeepSeek API生成题目 - ${testType}`);
      return await this._generateQuestionsWithDeepSeek(content, stage, difficulty, questionCount, testType);
    }
    
    console.log(`🤖 使用本地模型 ${this.model} 生成${questionCount}道${testType}题目...`);
    
    // 🔧 使用队列化请求
    return await this.queuedAIRequest(async () => {
      console.log(`🎯 开始生成题目 - 阶段${stage}, 难度${difficulty}, 数量${questionCount}`);
      console.log(`📝 内容长度: ${content?.length || 0} 字符`);
      console.log(`📄 内容预览: ${content?.substring(0, 300)}...`);
      
      // 🔧 修复：确保有足够的内容
      if (!content || content.length < 100) {
        throw new Error('提供的学习内容太少，无法生成有效的测试题目');
      }
      
      return await this._generateQuestionsCore(content, stage, difficulty, questionCount, testType);
    }, `生成题目-${testType || '测试'}`);
  }
  // 🔧 题目生成的核心逻辑
  async _generateQuestionsCore(content, stage, difficulty, questionCount, testType) {
    try {
      // 🔧 移除重复的日志，只在外层函数记录
      
      // 🔧 修复：确保有足够的内容
      if (!content || content.length < 100) {
        throw new Error('提供的学习内容太少，无法生成有效的测试题目');
      }
      
      // 判断是否为综合测试（stage为1且内容较长）
      const isComprehensiveTest = stage === 1 && content && content.length > 1000;
      const testType = isComprehensiveTest ? '综合评估测试' : `第${stage}阶段测试`;      // 🔧 彻底改进题目生成prompt，强调针对性和专业性
      const prompt = `你是一位专业的考试题目设计专家。请基于以下学习内容生成 ${questionCount} 道${difficulty}难度的专业测试题目。

重要说明：这是针对具体学习材料的专业测试，题目必须严格基于提供的内容。

=== 学习内容 ===
${content.substring(0, 8000)}
=== 内容结束 ===

请生成 ${questionCount} 道测试题目，要求：

1. **针对性强**：题目必须基于上述内容，不要添加内容中没有的信息
2. **难度适中**：${difficulty}难度，既要有基础理解题，也要有应用分析题
3. **类型多样**：包含选择题和判断题
4. **答案准确**：确保答案在提供的内容中能找到依据

返回JSON格式：
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "基于内容的具体问题？",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctAnswer": 0,
      "explanation": "答案解释，引用具体内容"
    },
    {
      "id": 2,
      "type": "true_false",
      "question": "判断题内容（基于提供的材料）",
      "options": ["正确", "错误"],
      "correctAnswer": 0,
      "explanation": "判断依据和解释"
    }
  ]
}

要求所有题目都必须基于提供的学习内容，确保答案准确性。

重要：请严格按照上述JSON格式返回，不要添加任何额外的文字说明、注释或markdown标记。直接返回有效的JSON对象。`;

      console.log(`🤖 使用模型 ${this.model} 生成${questionCount}道${testType}题目...`);
      
      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.3, // 降低随机性，提高内容相关性
          num_ctx: 16384, // 增大上下文窗口
          num_predict: 3000, // 适当的生成长度
          top_p: 0.8,
          repeat_penalty: 1.1
        }
      });

      console.log('📦 AI响应接收完成，开始解析...');
      console.log('📄 AI响应长度:', response.message.content.length);
      console.log('📝 AI响应预览:', response.message.content.substring(0, 500));

      // 🔧 增强的JSON处理
      let jsonContent = response.message.content.trim();
      
      // 第一步：清理明显的非JSON内容
      console.log('🧹 开始清理JSON内容...');
      
      // 移除markdown代码块
      jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // 查找JSON对象的开始和结束
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        console.error('❌ 未找到有效的JSON格式');
        console.log('原始响应:', jsonContent);
        throw new Error('AI响应中未找到有效的JSON格式');
      }
      
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
      console.log('✅ JSON内容提取完成，长度:', jsonContent.length);
      
      // 第二步：尝试解析JSON
      let parsed;
      try {

        parsed = JSON.parse(jsonContent);
        console.log('✅ JSON解析成功');
      } catch (parseError) {
        console.log('🔧 JSON解析失败，尝试修复...');
        console.log('解析错误:', parseError.message);
        
        // 尝试修复常见的JSON问题
        let fixedJson = jsonContent
          .replace(/,\s*}/g, '}') // 移除对象末尾的逗号
          .replace(/,\s*]/g, ']') // 移除数组末尾的逗号
          .replace(/'/g, '"')     // 替换单引号为双引号
          .replace(/(\w+):/g, '"$1":') // 为属性名添加引号
          .replace(/"{2,}/g, '"'); // 移除多余的引号
          try {
          parsed = JSON.parse(fixedJson);
          console.log('✅ JSON修复并解析成功');
        } catch (secondError) {
          console.error('❌ JSON修复失败，尝试从文本中提取题目...');
          console.log('解析错误:', secondError.message);
          
          // 🔧 新增：兜底机制 - 从AI文本输出中提取题目
          try {
            parsed = this.extractQuestionsFromText(response.message.content, questionCount);
            console.log('✅ 从文本中提取题目成功');
          } catch (extractError) {
            console.error('❌ 文本提取也失败:', extractError.message);
            console.log('原始内容:', jsonContent.substring(0, 1000));
            throw new Error(`AI生成内容格式错误: AI响应中未找到有效的JSON格式。请重试或联系管理员。`);
          }
        }
      }
      
      // 第三步：验证题目数据结构
      if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        console.error('❌ AI未能生成有效的题目数据结构');
        console.log('解析结果:', parsed);
        throw new Error('AI未能生成有效的题目数据结构');
      }
      
      console.log(`🔍 AI生成了${parsed.questions.length}道题目，开始验证...`);
      
      // 第四步：验证并清理题目内容
      const validQuestions = [];
      
      for (let i = 0; i < parsed.questions.length; i++) {
        const q = parsed.questions[i];
        console.log(`🔍 验证题目${i + 1}: ${q.question?.substring(0, 50)}...`);
        
        // 验证必需字段
        if (!q.question || !q.options || !Array.isArray(q.options)) {
          console.warn(`⚠️ 题目${i + 1}缺少必需字段，跳过`);
          continue;
        }
        
        const questionType = q.type === 'true_false' ? 'true_false' : 'multiple_choice';
        
        // 验证选项
        let validOptions;
        if (questionType === 'true_false') {
          validOptions = ['正确', '错误'];
        } else {
          validOptions = q.options.length >= 4 ? 
            q.options.slice(0, 4).map(opt => String(opt).trim()) :
            [...q.options.map(opt => String(opt).trim()), ...Array(4 - q.options.length).fill(0).map((_, idx) => `选项${String.fromCharCode(65 + q.options.length + idx)}`)];
        }
        
        // 验证正确答案
        let correctAnswer = 0;
        if (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < validOptions.length) {
          correctAnswer = q.correctAnswer;
        } else {
          // 如果答案无效，随机分配一个
          correctAnswer = Math.floor(Math.random() * validOptions.length);
          console.warn(`⚠️ 题目${i + 1}的正确答案无效，随机分配为选项${correctAnswer}`);
        }
        
        const validQuestion = {
          id: i + 1,
          type: questionType,
          question: String(q.question).trim(),
          options: validOptions,
          correctAnswer: correctAnswer,
          explanation: q.explanation ? String(q.explanation).trim() : '基于学习内容的相关知识点。'
        };
        
        // 验证题目质量
        if (validQuestion.question.length >= 10 && validQuestion.question.length <= 200) {
          validQuestions.push(validQuestion);
          console.log(`✅ 题目${i + 1}验证通过`);
        } else {
          console.warn(`⚠️ 题目${i + 1}长度不符合要求，跳过`);
        }
      }
      
      if (validQuestions.length === 0) {
        throw new Error('AI生成的题目质量不符合要求，所有题目都被过滤掉了');
      }
      
      // 输出正确答案分布统计
      const answerDistribution = {};
      validQuestions.forEach(q => {
        const key = `${q.type}_${q.correctAnswer}`;
        answerDistribution[key] = (answerDistribution[key] || 0) + 1;
      });
      console.log('📊 正确答案分布:', answerDistribution);
      
      console.log(`✅ 成功生成${validQuestions.length}道有效${testType}题目`);
      return { questions: validQuestions };
        
    } catch (error) {
      console.error('❌ AI题目生成失败:', error.message);
      console.error('错误详情:', error);
      
      // 🔧 提供更详细的错误信息和备用方案
      if (error.message.includes('模型') || error.message.includes('连接')) {
        throw new Error(`AI服务连接失败: ${error.message}。请检查Ollama服务是否正常运行。`);
      } else if (error.message.includes('JSON') || error.message.includes('格式')) {
        throw new Error(`AI生成内容格式错误: ${error.message}。请重试或联系管理员。`);
      } else if (error.message.includes('内容太少')) {
        throw new Error(`学习内容不足: ${error.message}。请确保上传的文件包含足够的学习内容。`);
      } else {
        throw new Error(`题目生成失败: ${error.message}`);
      }
    }
  }

  // 🤖 新增：使用DeepSeek API生成题目
  async _generateQuestionsWithDeepSeek(content, stage, difficulty, questionCount, testType) {
    try {
      const deepseekService = require('./deepseekService');
      
      // 检查DeepSeek可用性
      const isAvailable = await deepseekService.checkAvailability();
      if (!isAvailable) {
        console.log('⚠️ DeepSeek不可用，降级到本地模型');
        return await this.queuedAIRequest(async () => {
          return await this._generateQuestionsCore(content, stage, difficulty, questionCount, testType);
        }, `生成题目-${testType}(降级)`);
      }

      // 构建DeepSeek专用提示
      const prompt = `你是一位专业的考试题目设计专家。请基于以下学习内容生成 ${questionCount} 道${difficulty}难度的专业测试题目。

重要说明：这是针对具体学习材料的专业测试，题目必须严格基于提供的内容。

=== 学习内容 ===
${content.substring(0, 8000)}
=== 内容结束 ===

请生成 ${questionCount} 道测试题目，要求：

1. **针对性强**：题目必须基于上述内容，不要添加内容中没有的信息
2. **难度适中**：${difficulty}难度，既要有基础理解题，也要有应用分析题
3. **类型多样**：包含选择题和判断题
4. **答案准确**：确保答案在提供的内容中能找到依据

返回JSON格式：
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "基于内容的具体问题？",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctAnswer": 0,
      "explanation": "答案解释，引用具体内容"
    },
    {
      "id": 2,
      "type": "true_false",
      "question": "判断题内容（基于提供的材料）",
      "options": ["正确", "错误"],
      "correctAnswer": 0,
      "explanation": "判断依据和解释"
    }
  ]
}

要求所有题目都必须基于提供的学习内容，确保答案准确性。

重要：请严格按照上述JSON格式返回，不要添加任何额外的文字说明、注释或markdown标记。直接返回有效的JSON对象。`;

      console.log(`🤖 使用DeepSeek生成${questionCount}道${testType}题目...`);
      
      // 🔧 优化：增加重试机制处理aborted错误
      let response;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          response = await deepseekService.generateCompletion(prompt, {
            timeout: 120000, // 2分钟超时
            temperature: 0.1,
            max_tokens: 3000
          });
          break; // 成功则跳出循环
        } catch (error) {
          retryCount++;
          console.log(`⚠️ DeepSeek请求失败 (尝试 ${retryCount}/${maxRetries + 1}): ${error.message}`);
          
          if (error.message.includes('aborted') && retryCount <= maxRetries) {
            console.log(`🔄 检测到aborted错误，${retryCount < maxRetries ? '等待重试...' : '降级到本地模型'}`);
            if (retryCount < maxRetries) {
              // 等待一段时间后重试
              await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
              continue;
            }
          }
          
          // 如果是最后一次尝试或非aborted错误，抛出异常
          if (retryCount > maxRetries) {
            throw new Error(`DeepSeek请求在${maxRetries + 1}次尝试后仍然失败: ${error.message}`);
          } else {
            throw error;
          }
        }
      }
        // 解析DeepSeek响应
      let questionsData;
      try {
        // 改进的JSON提取逻辑
        const cleanedResponse = this.extractAndCleanJSON(response);
        questionsData = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('❌ DeepSeek响应解析失败，原始响应:', response.substring(0, 500));
        console.error('❌ 解析错误:', parseError.message);
        console.log('⚠️ 降级到本地模型');
        return await this.queuedAIRequest(async () => {
          return await this._generateQuestionsCore(content, stage, difficulty, questionCount, testType);
        }, `生成题目-${testType}(解析失败降级)`);
      }

      // 验证题目数据
      if (!questionsData?.questions || !Array.isArray(questionsData.questions)) {
        console.error('❌ DeepSeek返回的题目数据格式不正确，降级到本地模型');
        return await this.queuedAIRequest(async () => {
          return await this._generateQuestionsCore(content, stage, difficulty, questionCount, testType);
        }, `生成题目-${testType}(格式错误降级)`);
      }

      console.log(`✅ DeepSeek成功生成${questionsData.questions.length}道题目`);
      
      return {
        questions: questionsData.questions,
        model: 'deepseek',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ DeepSeek题目生成失败，降级到本地模型:', error.message);
      return await this.queuedAIRequest(async () => {
        return await this._generateQuestionsCore(content, stage, difficulty, questionCount, testType);
      }, `生成题目-${testType}(错误降级)`);
    }
  }

  // 🔧 新增：生成学习建议
  async generateLearningSuggestions(completionRate, timeSpent, difficulty, topics) {
    return await this.queuedAIRequest(async () => {
      const prompt = `作为AI学习助手，请基于以下学习数据为用户生成个性化的学习建议：

学习数据：
- 完成率：${completionRate}%
- 已投入时间：${timeSpent}分钟
- 难度等级：${difficulty}
- 学习主题：${topics.join('、')}

请提供5-7条具体、实用的学习建议，帮助用户提高学习效果和进度。`;

      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.3,
          num_ctx: 4096,
          num_predict: 800
        }
      });

      // 解析回答成数组格式
      const suggestions = response.message.content
        .split('\n')
        .filter(line => line.trim().length > 10)
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(suggestion => suggestion.length > 0)
        .slice(0, 7);

      return suggestions.length > 0 ? suggestions : [
        "保持定期学习，每天至少投入30分钟",
        "遇到难点时，可以向AI助手提问",
        "完成每个阶段后，回顾关键要点"
      ];
    }, '生成学习建议');
  }

  // 🔧 新增：评估学习答案
  async evaluateAnswer(question, userAnswer, correctAnswer, context) {
    return await this.queuedAIRequest(async () => {
      const prompt = `作为AI学习评估专家，请评估用户的答案：

题目：${question}
用户答案：${userAnswer}
正确答案：${correctAnswer}
${context ? `学习上下文：${JSON.stringify(context)}` : ''}

请提供：
1. 评估结果（正确/错误）
2. 详细解释
3. 学习建议

请以JSON格式回复：
{
  "isCorrect": true/false,
  "explanation": "详细解释",
  "suggestion": "学习建议"
}`;

      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.2,
          num_ctx: 4096,
          num_predict: 600
        }
      });

      try {
        const jsonContent = this.extractAndCleanJSON(response.message.content);
        return JSON.parse(jsonContent);
      } catch (error) {
        // 返回基础评估结果
        const isCorrect = String(userAnswer).toLowerCase() === String(correctAnswer).toLowerCase();
        return {
          isCorrect,
          explanation: isCorrect ? "回答正确！" : `回答错误。正确答案是：${correctAnswer}`,
          suggestion: isCorrect ? "继续保持！" : "建议复习相关内容"
        };
      }
    }, '评估答案');
  }

  // 🔧 新增：文档内容分析方法
  async analyzeDocumentContent(content, fileName, analysisType = 'comprehensive') {
    console.log(`📊 本地AI分析文档: ${fileName} (类型: ${analysisType})`);
    
    return this.queuedAIRequest(async () => {
      const prompt = this.buildAnalysisPrompt(content, fileName, analysisType);
      
      try {
        const response = await this.ollama.chat({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 4000,
            top_p: 0.9
          }
        });

        const result = response.message.content;
        console.log('✅ 本地AI文档分析完成');
        
        return this.parseAnalysisResult(result, analysisType);

      } catch (error) {
        console.error('❌ 本地AI文档分析失败:', error);
        throw error;
      }
    }, 'document-analysis');
  }

  // 🔧 新增：构建分析提示词
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
  "overallScore": "综合评分（1-10）",
  "completeness": "完整性评分（1-10）",
  "accuracy": "准确性评分（1-10）",
  "clarity": "清晰度评分（1-10）",
  "practicality": "实用性评分（1-10）",
  "strengths": ["优点1", "优点2", "优点3"],
  "weaknesses": ["不足1", "不足2"],
  "improvements": ["改进建议1", "改进建议2"],
  "recommendation": "推荐用途"
}`,
      
      extraction: `
请提取文档中的关键信息，包括：
1. 重要数据和数字
2. 关键定义和概念
3. 流程和步骤
4. 重要结论
5. 参考资料

请以JSON格式返回提取结果：
{
  "keyData": ["数据1", "数据2"],
  "definitions": {"术语1": "定义1", "术语2": "定义2"},
  "processes": ["步骤1", "步骤2", "步骤3"],
  "conclusions": ["结论1", "结论2"],
  "references": ["参考1", "参考2"]
}`
    };

    return basePrompt + (typePrompts[analysisType] || typePrompts.comprehensive);
  }

  // 🔧 新增：解析分析结果
  parseAnalysisResult(result, analysisType) {
    try {
      // 尝试提取JSON部分
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        return JSON.parse(jsonStr);
      }
      
      // 如果没有找到JSON，返回原始文本格式的结果
      return {
        summary: result.substring(0, 500) + '...',
        rawContent: result,
        analysisType: analysisType,
        note: '无法解析为结构化数据，已返回原始分析内容'
      };
      
    } catch (error) {
      console.warn('⚠️ 分析结果解析失败，返回原始内容:', error.message);
      return {
        summary: result.substring(0, 500) + '...',
        rawContent: result,
        analysisType: analysisType,
        error: error.message
      };
    }
  }

  // 🔧 新增：从AI文本输出中提取题目的兜底方法
  extractQuestionsFromText(text, expectedCount) {
    console.log('🔍 开始从文本中提取题目...');
    
    const questions = [];
    let currentId = 1;
    
    // 提取题目的正则表达式
    const questionPatterns = [
      // 匹配 "题目 X：" 或 "**题目 X：**" 格式
      /\*?\*?题目\s*(\d+)[：:][^]*?(?=\*?\*?题目\s*\d+[：:]|\*?\*?正确答案|$)/gi,
      // 匹配选择题格式
      /问题[：:]?\s*([^]*?)(?:\n[A-D]\)|A\))/gi,
      // 匹配判断题格式
      /问题[：:]?\s*([^]*?)(?:\n正确答案|正确|错误)/gi
    ];
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 查找题目标识
      if (line.includes('题目') && (line.includes('：') || line.includes(':'))) {
        console.log(`🔍 找到题目: ${line.substring(0, 50)}...`);
        
        const question = {
          id: currentId++,
          type: 'multiple_choice',
          question: '',
          options: [],
          correctAnswer: 0,
          explanation: ''
        };
        
        // 查找问题内容
        for (let j = i + 1; j < lines.length && j < i + 15; j++) {
          const currentLine = lines[j];
          
          if (currentLine.includes('问题') && (currentLine.includes('：') || currentLine.includes(':'))) {
            question.question = currentLine.replace(/^.*?[：:]/, '').trim();
            i = j;
            break;
          }
        }
        
        // 查找选项
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const currentLine = lines[j];
          
          // 检查是否是选项
          if (/^[A-D]\)/.test(currentLine)) {
            question.options.push(currentLine.replace(/^[A-D]\)\s*/, '').trim());
          } else if (currentLine.includes('正确') || currentLine.includes('错误')) {
            // 这是判断题
            question.type = 'true_false';
            question.options = ['正确', '错误'];
            if (currentLine.includes('正确答案') && currentLine.includes('正确')) {
              question.correctAnswer = 0;
            } else if (currentLine.includes('正确答案') && currentLine.includes('错误')) {
              question.correctAnswer = 1;
            }
            break;
          } else if (currentLine.includes('正确答案')) {
            // 查找正确答案
            const answerMatch = currentLine.match(/[A-D]|\d+/);
            if (answerMatch) {
              const answer = answerMatch[0];
              if (/[A-D]/.test(answer)) {
                question.correctAnswer = answer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
              } else {
                question.correctAnswer = parseInt(answer) || 0;
              }
            }
          } else if (currentLine.includes('解释') && currentLine.includes('：')) {
            question.explanation = currentLine.replace(/^.*?[：:]/, '').trim();
          } else if (currentLine.includes('题目') && (currentLine.includes('：') || currentLine.includes(':'))) {
            // 下一个题目开始，停止解析当前题目
            i = j - 1; // 回退一行，让外层循环处理下一个题目
            break;
          }
        }
        
        // 验证题目完整性
        if (question.question && question.options.length > 0) {
          // 确保选择题有4个选项
          if (question.type === 'multiple_choice' && question.options.length < 4) {
            while (question.options.length < 4) {
              question.options.push(`选项${String.fromCharCode(65 + question.options.length)}`);
            }
          }
          
          // 设置默认解释
          if (!question.explanation) {
            question.explanation = '基于学习内容的相关知识点。';
          }
          
          questions.push(question);
          console.log(`✅ 成功提取题目${question.id}: ${question.question.substring(0, 30)}...`);
          
          if (questions.length >= expectedCount) {
            break;
          }
        } else {
          console.warn(`⚠️ 题目${currentId - 1}提取不完整，跳过`);
          currentId--; // 回退ID
        }
      }
    }
    
    // 如果提取的题目数量不足，生成一些基础题目
    while (questions.length < Math.min(expectedCount, 3)) {
      const fallbackQuestion = {
        id: questions.length + 1,
        type: 'multiple_choice',
        question: `基于学习内容，以下关于核心概念的理解哪项最准确？`,
        options: [
          '需要深入理解学习材料的核心内容',
          '可以通过常识进行判断',
          '不需要具体的学习过程',
          '答案在材料中没有明确体现'
        ],
        correctAnswer: 0,
        explanation: '正确理解学习材料需要仔细阅读和思考其核心内容。'
      };
      
      questions.push(fallbackQuestion);
      console.log(`🔧 生成兜底题目${fallbackQuestion.id}`);
    }
      console.log(`✅ 从文本中提取了${questions.length}道题目`);
    
    return { questions };
  }

  // 🤖 新增：问答功能 - 基于上下文生成回答
  async generateAnswer(question, context) {
    try {
      console.log('🤖 开始生成问答回答...');
      console.log(`问题: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`);
      console.log(`上下文长度: ${context.length}字符`);

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

【回答】：`;

      console.log('🔄 调用AI服务生成回答...');
      
      const response = await this.callAI(prompt, {
        maxTokens: 1000,
        temperature: 0.3  // 较低的温度确保回答更准确
      });

      if (!response || !response.text) {
        throw new Error('AI服务返回空结果');
      }

      let answer = response.text.trim();
      
      // 清理回答格式
      answer = answer.replace(/^【回答】：?/i, '').trim();
      answer = answer.replace(/^回答：?/i, '').trim();
      
      console.log(`✅ 问答回答生成成功，长度: ${answer.length}字符`);
      
      return answer;

    } catch (error) {
      console.error('❌ 生成问答回答失败:', error);
      throw new Error(`问答生成失败: ${error.message}`);
    }
  }

  // 新增：统一AI调用方法
  async callAI(prompt, options = {}) {
    // options: { maxTokens, temperature }
    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: [
          { role: 'system', content: '你是一个专业的中文智能问答助手。' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 1000
        }
      });
      
      // 修复：正确处理Ollama响应结构
      if (response && response.message && response.message.content) {
        return { text: response.message.content };
      } else if (response && response.response) {
        return { text: response.response };
      } else if (response && typeof response === 'string') {
        return { text: response };
      } else {
        console.error('❌ AI响应结构未知:', response);
        throw new Error('AI响应格式异常');
      }
    } catch (error) {
      console.error('❌ AI调用失败:', error);
      throw new Error('AI调用失败: ' + error.message);
    }
  }
}

module.exports = new AIService();
