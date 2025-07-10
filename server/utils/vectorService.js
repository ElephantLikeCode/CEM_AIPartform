const fs = require('fs-extra');
const path = require('path');

class VectorService {
  constructor() {
    this.vectorsPath = path.join(__dirname, '../data/vectors');
    this.chunksPath = path.join(__dirname, '../data/chunks');
    this.ensureDirectories();
  }

  async ensureDirectories() {
    await fs.ensureDir(this.vectorsPath);
    await fs.ensureDir(this.chunksPath);
  }

  // 文本分块 - 智能切分保持语义完整性
  splitIntoChunks(text, maxChunkSize = 500, overlap = 50) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = [];
    
    // 首先按段落分割
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      const cleanParagraph = paragraph.trim();
      
      // 如果当前块加上新段落超过限制
      if (currentChunk.length + cleanParagraph.length + 2 > maxChunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          
          // 添加重叠内容
          const words = currentChunk.split(' ');
          const overlapWords = words.slice(-overlap).join(' ');
          currentChunk = overlapWords + '\n\n' + cleanParagraph;
        } else {
          // 段落本身就很长，需要进一步切分
          const sentences = this.splitLongParagraph(cleanParagraph, maxChunkSize);
          chunks.push(...sentences);
        }
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + cleanParagraph;
        } else {
          currentChunk = cleanParagraph;
        }
      }
    }
    
    // 添加最后一个块
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 20); // 过滤太短的块
  }

  // 切分长段落
  splitLongParagraph(paragraph, maxSize) {
    const sentences = paragraph.split(/[。！？.!?]/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const cleanSentence = sentence.trim();
      if (currentChunk.length + cleanSentence.length + 1 > maxSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = cleanSentence;
        } else {
          // 句子本身太长，强制切分
          chunks.push(cleanSentence.substring(0, maxSize));
        }
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '。' + cleanSentence;
        } else {
          currentChunk = cleanSentence;
        }
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  // 使用Ollama的嵌入模型生成向量
  async generateEmbedding(text) {
    try {
      const { Ollama } = require('ollama');
      const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
      const ollama = new Ollama({ host: ollamaHost });
      
      // 使用专门的嵌入模型
      const response = await ollama.embeddings({
        model: 'nomic-embed-text', // 或者 'all-minilm' 
        prompt: text
      });
      
      return response.embedding;
    } catch (error) {
      console.error('生成嵌入向量失败:', error);
      // 使用简单的词频向量作为备用
      return this.generateSimpleVector(text);
    }
  }

  // 备用：简单的TF-IDF向量生成
  generateSimpleVector(text) {
    const words = text.toLowerCase().match(/[\u4e00-\u9fa5a-z0-9]+/g) || [];
    const wordCount = {};
    const vector = new Array(100).fill(0); // 固定长度向量
    
    // 统计词频
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // 简单哈希映射到向量位置
    Object.entries(wordCount).forEach(([word, count]) => {
      const hash = this.simpleHash(word) % 100;
      vector[hash] += count;
    });
    
    // 归一化
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return vector.map(val => val / magnitude);
    }
    
    return vector;
  }

  // 简单哈希函数
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash);
  }

  // 计算余弦相似度
  cosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // 保存文档向量
  async saveDocumentVectors(fileId, fileName, content) {
    try {
      console.log(`📦 开始为文档 ${fileName} 生成向量...`);
      
      // 分块
      const chunks = this.splitIntoChunks(content);
      console.log(`✂️ 文档分为 ${chunks.length} 个块`);
      
      const vectorData = {
        fileId,
        fileName,
        totalChunks: chunks.length,
        chunks: []
      };
      
      // 为每个块生成向量
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await this.generateEmbedding(chunk);
        
        vectorData.chunks.push({
          id: `${fileId}_chunk_${i}`,
          content: chunk,
          vector: vector,
          metadata: {
            chunkIndex: i,
            length: chunk.length
          }
        });
        
        console.log(`📊 生成第 ${i + 1}/${chunks.length} 个块的向量`);
      }
      
      // 保存到文件
      const vectorFile = path.join(this.vectorsPath, `${fileId}.json`);
      await fs.writeJson(vectorFile, vectorData, { spaces: 2 });
      
      console.log(`✅ 文档 ${fileName} 向量保存完成`);
      return vectorData;
      
    } catch (error) {
      console.error('保存文档向量失败:', error);
      throw error;
    }
  }
  // 搜索相关内容 - 🔧 优化检索逻辑
  async searchSimilarContent(query, fileId = null, topK = 5) {
    try {
      console.log(`🔍 搜索相关内容: "${query.substring(0, 50)}..."`);
      
      // 生成查询向量
      const queryVector = await this.generateEmbedding(query);
      
      const results = [];
      
      // 确定搜索范围
      const searchFiles = fileId ? 
        [path.join(this.vectorsPath, `${fileId}.json`)] :
        await this.getAllVectorFiles();
      
      console.log(`📁 搜索范围: ${searchFiles.length} 个向量文件`);
      
      // 搜索每个文档
      for (const filePath of searchFiles) {
        try {
          if (await fs.pathExists(filePath)) {
            const vectorData = await fs.readJson(filePath);
            
            // 计算每个块的相似度
            for (const chunk of vectorData.chunks) {
              const similarity = this.cosineSimilarity(queryVector, chunk.vector);
              
              // 🔧 降低相似度阈值，增加检索结果
              if (similarity > 0.05) { // 从0.1降低到0.05
                results.push({
                  fileId: vectorData.fileId,
                  fileName: vectorData.fileName,
                  chunkId: chunk.id,
                  content: chunk.content,
                  similarity: similarity,
                  metadata: chunk.metadata || {}
                });
              }
            }
          } else {
            console.warn(`⚠️ 向量文件不存在: ${filePath}`);
          }
        } catch (error) {
          console.warn(`❌ 读取向量文件失败: ${filePath}`, error.message);
        }
      }
      
      // 按相似度排序并返回topK结果
      const sortedResults = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
      
      console.log(`✅ 找到 ${sortedResults.length} 个相关内容块 (总计算: ${results.length})`);
      
      // 🔧 如果找不到足够的高质量结果，尝试使用关键词匹配
      if (sortedResults.length < 2) {
        console.log(`🔍 相似度搜索结果不足，尝试关键词匹配...`);
        const keywordResults = await this.keywordSearch(query, fileId, topK);
        
        // 合并结果，避免重复
        const combinedResults = [...sortedResults];
        for (const kwResult of keywordResults) {
          const exists = combinedResults.some(r => 
            r.fileId === kwResult.fileId && r.chunkId === kwResult.chunkId
          );
          if (!exists) {
            combinedResults.push(kwResult);
          }
        }
        
        console.log(`✅ 关键词匹配补充后共 ${combinedResults.length} 个结果`);
        return combinedResults.slice(0, topK);
      }
      
      return sortedResults;
      
    } catch (error) {
      console.error('❌ 搜索相似内容失败:', error);
      return [];
    }
  }

  // 获取所有向量文件
  async getAllVectorFiles() {
    try {
      const files = await fs.readdir(this.vectorsPath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.vectorsPath, file));
    } catch (error) {
      console.error('获取向量文件列表失败:', error);
      return [];
    }
  }

  // 删除文档向量
  async deleteDocumentVectors(fileId) {
    try {
      const vectorFile = path.join(this.vectorsPath, `${fileId}.json`);
      if (await fs.pathExists(vectorFile)) {
        await fs.remove(vectorFile);
        console.log(`🗑️ 已删除文档 ${fileId} 的向量数据`);
      }
    } catch (error) {
      console.error('删除文档向量失败:', error);
    }
  }

  // 为标签内容生成向量
  async saveTagVectors(tagId, tagName, mergedContent, fileIds) {
    try {
      console.log(`🏷️ 开始为标签 ${tagName} 生成向量...`);
      
      const chunks = this.splitIntoChunks(mergedContent);
      console.log(`✂️ 标签内容分为 ${chunks.length} 个块`);
      
      const vectorData = {
        tagId,
        tagName,
        fileIds,
        totalChunks: chunks.length,
        chunks: []
      };
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await this.generateEmbedding(chunk);
        
        vectorData.chunks.push({
          id: `tag_${tagId}_chunk_${i}`,
          content: chunk,
          vector: vector,
          metadata: {
            chunkIndex: i,
            length: chunk.length,
            isTagContent: true
          }
        });
      }
      
      const vectorFile = path.join(this.vectorsPath, `tag_${tagId}.json`);
      await fs.writeJson(vectorFile, vectorData, { spaces: 2 });
      
      console.log(`✅ 标签 ${tagName} 向量保存完成`);
      return vectorData;
      
    } catch (error) {
      console.error('保存标签向量失败:', error);
      throw error;
    }
  }

  // 🔧 新增：关键词搜索作为向量搜索的补充
  async keywordSearch(query, fileId = null, topK = 3) {
    try {
      console.log(`🔤 执行关键词搜索: "${query}"`);
      
      const results = [];
      const searchFiles = fileId ? 
        [path.join(this.vectorsPath, `${fileId}.json`)] :
        await this.getAllVectorFiles();
      
      // 提取关键词
      const keywords = this.extractKeywords(query);
      console.log(`🔑 提取关键词: ${keywords.join(', ')}`);
      
      for (const filePath of searchFiles) {
        try {
          if (await fs.pathExists(filePath)) {
            const vectorData = await fs.readJson(filePath);
            
            for (const chunk of vectorData.chunks) {
              const content = chunk.content.toLowerCase();
              let score = 0;
              let matchedKeywords = [];
              
              // 计算关键词匹配得分
              for (const keyword of keywords) {
                const keywordLower = keyword.toLowerCase();
                const matches = (content.match(new RegExp(keywordLower, 'g')) || []).length;
                if (matches > 0) {
                  score += matches * keyword.length; // 长关键词权重更高
                  matchedKeywords.push(keyword);
                }
              }
              
              if (score > 0) {
                results.push({
                  fileId: vectorData.fileId,
                  fileName: vectorData.fileName,
                  chunkId: chunk.id,
                  content: chunk.content,
                  similarity: Math.min(0.8, score / 100), // 转换为相似度值
                  metadata: {
                    ...chunk.metadata,
                    searchType: 'keyword',
                    matchedKeywords: matchedKeywords,
                    keywordScore: score
                  }
                });
              }
            }
          }
        } catch (error) {
          console.warn(`❌ 关键词搜索文件失败: ${filePath}`, error.message);
        }
      }
      
      const sortedResults = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
      
      console.log(`🔤 关键词搜索找到 ${sortedResults.length} 个结果`);
      return sortedResults;
      
    } catch (error) {
      console.error('❌ 关键词搜索失败:', error);
      return [];
    }
  }

  // 🔧 新增：提取查询中的关键词
  extractKeywords(query) {
    // 移除常见停用词
    const stopWords = ['的', '是', '在', '有', '和', '与', '或', '但', '如果', '因为', '所以', '什么', '怎么', '为什么', '如何', '请', '介绍', '解释', '说明'];
    
    // 分词并过滤
    const words = query
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ') // 保留中文、英文、数字
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.includes(word))
      .slice(0, 10); // 最多取10个关键词
    
    return [...new Set(words)]; // 去重
  }
}

module.exports = new VectorService();
