const express = require('express');
const beijingTime = require('../utils/beijingTime'); // 🕐 北京时间工具
const router = express.Router();
const database = require('../database/database');
const aiService = require('../utils/aiService');
const { requireAuth } = require('../middleware/auth');
const { initializeFileDatabase } = require('./upload'); // 引入文件数据库初始化函数

// 🔧 新增：实时更新标签文件统计的辅助函数
const updateTagFileStats = (tagId) => {
  try {
    const tagFiles = database.tags.getTagFiles(tagId);
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    // 验证文件是否真实存在且已完成处理
    const validFiles = tagFiles.filter(tf => {
      const file = fileDatabase.find(f => f.id === tf.file_id);
      return file && file.status === 'completed' && file.aiAnalysis;
    });
    
    // 只在有显著变化时记录日志
    if (validFiles.length !== tagFiles.length && tagFiles.length > 0) {
      console.log(`🔄 标签 ${tagId} 文件统计更新: ${tagFiles.length} -> ${validFiles.length} (有效文件)`);
    }
    
    return {
      totalFiles: tagFiles.length,
      validFiles: validFiles.length,
      fileDetails: validFiles.map(tf => {
        const file = fileDatabase.find(f => f.id === tf.file_id);
        return {
          id: file.id,
          name: file.originalName,
          status: file.status
        };
      })
    };
  } catch (error) {
    console.error(`更新标签 ${tagId} 文件统计失败:`, error);
    return { totalFiles: 0, validFiles: 0, fileDetails: [] };
  }
};

// 🏷️ 获取所有标签
router.get('/', async (req, res) => {
  try {
    const tags = database.tags.getAllTags();
    
    // 🔧 修复：为每个标签实时计算统计信息
    const tagsWithStats = tags.map(tag => {
      try {
        const stats = updateTagFileStats(tag.id);
        return {
          ...tag,
          fileCount: stats.validFiles, // 使用有效文件数量
          totalFileCount: stats.totalFiles, // 总文件数量（包括未完成的）
          lastUsed: stats.fileDetails.length > 0 ? beijingTime.toBeijingISOString() : null,
          hasValidFiles: stats.validFiles > 0,
          fileDetails: stats.fileDetails
        };
      } catch (error) {
        console.warn(`获取标签 ${tag.id} 统计信息失败:`, error);
        return {
          ...tag,
          fileCount: 0,
          totalFileCount: 0,
          lastUsed: null,
          hasValidFiles: false,
          fileDetails: []
        };
      }
    });

    console.log(`📋 返回 ${tagsWithStats.length} 个标签（含实时统计）`);

    res.json({
      success: true,
      data: tagsWithStats,
      total: tagsWithStats.length,
      message: `找到 ${tagsWithStats.length} 个标签，其中 ${tagsWithStats.filter(t => t.hasValidFiles).length} 个有可用文件`
    });

  } catch (error) {
    console.error('❌ 获取标签列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取标签列表失败',
      error: error.message
    });
  }
});

// 🏷️ 创建新标签
router.post('/', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const createdBy = req.user?.id || 1; // 假设从认证中间件获取用户ID

    console.log('🏷️ 创建新标签:', { name, description, color, createdBy });

    // 验证必填字段
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '标签名称不能为空'
      });
    }

    // 检查标签名称是否已存在
    const existingTag = database.get('SELECT * FROM tags WHERE name = ?', [name.trim()]);
    if (existingTag) {
      return res.status(409).json({
        success: false,
        message: '标签名称已存在'
      });
    }

    // 创建标签
    const result = database.tags.createTag(
      name.trim(),
      description?.trim() || '',
      color || '#1890ff',
      createdBy
    );

    // 获取创建的标签
    const newTag = database.get('SELECT * FROM tags WHERE id = ?', [result.lastInsertRowid]);

    console.log(`✅ 标签创建成功: ${newTag.name}`);

    res.status(201).json({
      success: true,
      message: '标签创建成功',
      data: {
        ...newTag,
        fileCount: 0,
        lastUsed: null
      }
    });

  } catch (error) {
    console.error('创建标签失败:', error);
    res.status(500).json({
      success: false,
      message: '创建标签失败',
      error: error.message
    });
  }
});

// 🏷️ 获取特定标签信息
router.get('/:id', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }

    const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }

    // 获取标签下的文件
    const tagFiles = database.tags.getTagFiles(tagId);
    
    // 🔧 标签学习内容功能已移除（数据库表已删除）
    const learningContent = null;

    const tagWithDetails = {
      ...tag,
      fileCount: tagFiles.length,
      files: tagFiles,
      hasLearningContent: false,
      learningContent: null
    };

    res.json({
      success: true,
      data: tagWithDetails
    });

  } catch (error) {
    console.error('获取标签详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取标签详情失败',
      error: error.message
    });
  }
});

// 🏷️ 更新标签
router.put('/:id', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    const { name, description, color } = req.body;

    console.log('🏷️ 更新标签:', { tagId, name, description, color });

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }

    // 检查标签是否存在
    const existingTag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    if (!existingTag) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }

    // 验证必填字段
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '标签名称不能为空'
      });
    }

    // 检查标签名称是否与其他标签重复
    const duplicateTag = database.get('SELECT * FROM tags WHERE name = ? AND id != ?', [name.trim(), tagId]);
    if (duplicateTag) {
      return res.status(409).json({
        success: false,
        message: '标签名称已存在'
      });
    }

    // 更新标签
    const result = database.tags.updateTag(
      tagId,
      name.trim(),
      description?.trim() || existingTag.description,
      color || existingTag.color
    );

    if (result.changes === 0) {
      return res.status(400).json({
        success: false,
        message: '标签更新失败'
      });
    }

    // 获取更新后的标签
    const updatedTag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    const files = database.tags.getTagFiles(tagId);

    console.log(`✅ 标签更新成功: ${updatedTag.name}`);

    res.json({
      success: true,
      message: '标签更新成功',
      data: {
        ...updatedTag,
        fileCount: files.length
      }
    });

  } catch (error) {
    console.error('更新标签失败:', error);
    res.status(500).json({
      success: false,
      message: '更新标签失败',
      error: error.message
    });
  }
});

// 🏷️ 删除标签 - 修改函数调用方式
router.delete('/:id', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    
    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }
    
    const { force } = req.query;
    console.log(`🗑️ 删除标签${tagId}, 强制模式: ${force === 'true'}`);
    
    // 获取标签信息
    const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }
    
    let result;
    
    if (force === 'true') {
      // 强制删除 - 🔧 修复调用方式
      result = database.tags.forceDeleteTag(tagId);
      console.log(`✅ 强制删除标签"${tag.name}"成功`);
      // 刷新文件数据库
      if (typeof initializeFileDatabase === 'function') {
        await initializeFileDatabase();
        console.log('🔄 文件数据库已刷新');
      }
    } else {
      // 🔧 在删除前检查并清理无效关联 - 修复调用方式
      try {
        const cleanupResult = database.tags.cleanupInvalidFileAssociations(tagId);
        if (cleanupResult.cleaned > 0) {
          console.log(`🧹 删除前清理: 清理了${cleanupResult.cleaned}个无效文件关联`);
        }
      } catch (cleanupError) {
        console.warn('删除前清理无效关联时出错:', cleanupError);
      }
      
      // 重新检查是否还有有效的文件关联
      const validFiles = database.tags.getTagFiles(tagId);
      if (validFiles.length > 0) {
        return res.status(400).json({
          success: false,
          message: `标签"${tag.name}"下还有${validFiles.length}个文件，请先移除文件关联或使用强制删除`,
          requiresForce: true,
          fileCount: validFiles.length
        });
      }
      
      // 普通删除 - 🔧 修复调用方式
      result = database.tags.deleteTag(tagId);
      console.log(`✅ 删除标签"${tag.name}"成功`);
    }
    
    res.json({
      success: true,
      message: `标签"${tag.name}"删除成功`,
      data: {
        deletedTag: tag,
        result: result
      }
    });
    
  } catch (error) {
    console.error('删除标签失败:', error);
    res.status(500).json({
      success: false,
      message: '删除标签失败',
      error: error.message
    });
  }
});

// 🔧 标签学习内容功能已完全移除（数据库表 tag_learning_content 已删除）
// 原路由：POST /:id/generate-learning-content - 为标签生成合并学习内容
// 如需恢复，请重新创建 tag_learning_content 表及相关函数

// 🔧 标签学习内容功能已移除（数据库表 tag_learning_content 已删除）
// 原路由：GET /:id/learning-content, DELETE /:id/learning-content
// 如需恢复，请重新创建 tag_learning_content 表

// 🔧 删除标签学习内容路由已移除（数据库表 tag_learning_content 已删除）

// 🏷️ 获取标签统计信息
router.get('/:id/stats', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }

    // 检查标签是否存在
    const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }

    // 获取标签下的文件
    const tagFiles = database.tags.getTagFiles(tagId);
    
    // 🔧 学习内容功能已移除（数据库表已删除）
    const learningContent = null;
    
    // 统计文件类型
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    const fileStats = {
      total: tagFiles.length,
      byType: {},
      byStatus: {},
      totalSize: 0,
      completedFiles: 0
    };

    for (const tagFile of tagFiles) {
      const file = fileDatabase.find(f => f.id === tagFile.file_id);
      if (file) {
        // 按类型统计
        const type = file.fileType.substring(1).toLowerCase();
        fileStats.byType[type] = (fileStats.byType[type] || 0) + 1;
        
        // 按状态统计
        fileStats.byStatus[file.status] = (fileStats.byStatus[file.status] || 0) + 1;
        
        // 大小统计
        fileStats.totalSize += file.fileSize || 0;
        
        // 完成文件统计
        if (file.status === 'completed') {
          fileStats.completedFiles++;
        }
      }
    }

    const stats = {
      tag: {
        id: tag.id,
        name: tag.name,
        description: tag.description,
        color: tag.color,
        createdAt: tag.created_at
      },
      files: fileStats,
      learningContent: {
        exists: !!learningContent,
        totalStages: learningContent?.total_stages || 0,
        contentLength: learningContent?.merged_content?.length || 0,
        lastGenerated: learningContent?.updated_at || null
      },
      readyForLearning: fileStats.completedFiles > 0,
      readyForTesting: !!learningContent && fileStats.completedFiles > 0
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('获取标签统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取标签统计失败',
      error: error.message
    });
  }
});

// 🔧 新增：获取标签的实时统计信息
router.get('/:id/realtime-stats', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }

    // 检查标签是否存在
    const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }

    // 获取实时统计信息
    const stats = updateTagFileStats(tagId);
    
    // 🔧 学习内容功能已移除（数据库表已删除）
    const learningContent = null;
    
    const realtimeStats = {
      tag: {
        id: tag.id,
        name: tag.name,
        description: tag.description,
        color: tag.color,
        createdAt: tag.created_at
      },
      files: {
        total: stats.totalFiles,
        valid: stats.validFiles,
        details: stats.fileDetails
      },
      learningContent: {
        exists: !!learningContent,
        totalStages: learningContent?.total_stages || 0,
        contentLength: learningContent?.merged_content?.length || 0,
        lastGenerated: learningContent?.updated_at || null
      },
      readyForLearning: stats.validFiles > 0,
      readyForTesting: !!learningContent && stats.validFiles > 0,
      lastUpdated: beijingTime.toBeijingISOString()
    };

    res.json({
      success: true,
      data: realtimeStats,
      message: '实时统计信息获取成功'
    });

  } catch (error) {
    console.error('获取标签实时统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取标签实时统计失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：获取可用于文件标记的所有标签
router.get('/available', async (req, res) => {
  try {
    console.log('📋 获取可用标签列表...');
    
    const tags = database.tags.getAllTags();
    
    // 为每个标签添加统计信息
    const tagsWithStats = tags.map(tag => {
      try {
        const stats = database.tags.getTagFileStats(tag.id);
        return {
          id: tag.id,
          name: tag.name,
          description: tag.description,
          color: tag.color,
          fileCount: stats.total_files || 0,
          lastUsed: stats.last_file_added,
          createdAt: tag.created_at
        };
      } catch (error) {
        console.warn(`获取标签 ${tag.id} 统计失败:`, error);
        return {
          id: tag.id,
          name: tag.name,
          description: tag.description,
          color: tag.color,
          fileCount: 0,
          lastUsed: null,
          createdAt: tag.created_at
        };
      }
    });
    
    console.log(`📋 返回 ${tagsWithStats.length} 个可用标签`);
    
    res.json({
      success: true,
      data: tagsWithStats,
      total: tagsWithStats.length,
      message: `找到 ${tagsWithStats.length} 个可用标签`
    });
    
  } catch (error) {
    console.error('❌ 获取可用标签失败:', error);
    res.status(500).json({
      success: false,
      message: '获取可用标签失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：搜索标签
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '搜索关键词不能为空'
      });
    }
    
    console.log('🔍 搜索标签:', query);
    
    // 搜索标签名称和描述
    const tags = database.all(`
      SELECT * FROM tags 
      WHERE name LIKE ? OR description LIKE ?
      ORDER BY 
        CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
        name
      LIMIT ?
    `, [
      `%${query}%`,
      `%${query}%`, 
      `${query}%`,
      parseInt(limit)
    ]);
    
    // 为搜索结果添加统计信息
    const tagsWithStats = tags.map(tag => {
      const stats = database.tags.getTagFileStats(tag.id);
      return {
        ...tag,
        fileCount: stats.total_files || 0,
        lastUsed: stats.last_file_added
      };
    });
    
    console.log(`🔍 搜索到 ${tagsWithStats.length} 个标签`);
    
    res.json({
      success: true,
      data: tagsWithStats,
      total: tagsWithStats.length,
      query: query,
      message: `搜索到 ${tagsWithStats.length} 个相关标签`
    });
    
  } catch (error) {
    console.error('❌ 搜索标签失败:', error);
    res.status(500).json({
      success: false,
      message: '搜索标签失败',
      error: error.message
    });
  }
});

// 🏷️ 修改：批量操作标签 - 支持强制删除
router.post('/batch', async (req, res) => {
  try {
    const { action, tagIds, data, force = false } = req.body;
    
    console.log('🔄 批量操作标签:', { action, tagIds: tagIds?.length, data, force });
    
    if (!action || !Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '操作类型和标签ID数组不能为空'
      });
    }
    
    let result = { success: 0, failed: 0, details: [] };
    
    switch (action) {
      case 'delete':
        try {
          // 使用新的批量删除方法
          const batchResult = database.tags.batchDeleteTags(tagIds, force);
          
          result.success = batchResult.successful.length;
          result.failed = batchResult.failed.length;
          result.details = [
            ...batchResult.successful.map(item => ({
              tagId: item.tagId,
              status: 'success',
              reason: `删除成功${item.affectedFiles > 0 ? `，清理了${item.affectedFiles}个文件关联` : ''}`,
              affectedFiles: item.affectedFiles
            })),
            ...batchResult.failed.map(item => ({
              tagId: item.tagId,
              status: 'failed',
              reason: item.reason,
              requiresForce: item.requiresForce || false
            }))
          ];
          
          // 如果有需要强制删除的标签，提供建议
          const requiresForceCount = batchResult.failed.filter(f => f.requiresForce).length;
          if (requiresForceCount > 0 && !force) {
            result.suggestion = `有 ${requiresForceCount} 个标签包含文件关联，如需删除请使用强制模式`;
            result.forceDeleteUrl = '/api/tags/batch';
            result.forceDeletePayload = { ...req.body, force: true };
          }
          
          result.summary = {
            totalProcessed: tagIds.length,
            successful: result.success,
            failed: result.failed,
            totalAffectedFiles: batchResult.totalAffectedFiles,
            forceMode: force
          };
          
        } catch (batchError) {
          console.error('批量删除执行失败:', batchError);
          return res.status(500).json({
            success: false,
            message: '批量删除执行失败',
            error: batchError.message
          });
        }
        break;
        
      case 'update_color':
        // ...existing color update logic...
        if (!data?.color) {
          return res.status(400).json({
            success: false,
            message: '更新颜色操作需要提供颜色值'
          });
        }
        
        for (const tagId of tagIds) {
          try {
            const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
            if (!tag) {
              result.failed++;
              result.details.push({
                tagId,
                status: 'failed',
                reason: '标签不存在'
              });
              continue;
            }
            
            const updateResult = database.tags.updateTag(
              tagId,
              tag.name,
              tag.description,
              data.color
            );
            
            if (updateResult.changes > 0) {
              result.success++;
              result.details.push({
                tagId,
                status: 'success',
                reason: '颜色更新成功'
              });
            } else {
              result.failed++;
              result.details.push({
                tagId,
                status: 'failed',
                reason: '更新失败'
              });
            }
          } catch (error) {
            result.failed++;
            result.details.push({
              tagId,
              status: 'failed',
              reason: error.message
            });
          }
        }
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: `不支持的操作类型: ${action}`
        });
    }
    
    console.log(`✅ 批量操作完成: 成功${result.success}个，失败${result.failed}个`);
    
    res.json({
      success: result.failed === 0,
      data: result,
      message: `批量${action === 'delete' ? '删除' : '操作'}完成: 成功${result.success}个，失败${result.failed}个`
    });
    
  } catch (error) {
    console.error('❌ 批量操作标签失败:', error);
    res.status(500).json({
      success: false,
      message: '批量操作标签失败',
      error: error.message
    });
  }
});

// 🔧 修复：获取标签删除影响分析 - 修复调用方式
router.get('/:id/delete-impact', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    
    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }
    
    console.log(`🔍 分析标签${tagId}删除影响...`);
    
    // 🔧 在分析前先主动清理无效关联 - 修复调用方式
    try {
      const cleanupResult = database.tags.cleanupInvalidFileAssociations(tagId);
      if (cleanupResult.cleaned > 0) {
        console.log(`🧹 预清理完成: 清理了${cleanupResult.cleaned}个无效文件关联`);
      }
    } catch (cleanupError) {
      console.warn('预清理无效关联时出错:', cleanupError);
    }
    
    const impact = database.tags.getDeleteImpactAnalysis(tagId);
    
    if (!impact) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }
    
    console.log(`📊 标签"${impact.tag.name}"删除影响分析:`, {
      有效文件关联: impact.impact.fileAssociations,
      原始文件关联: impact.impact.originalFileAssociations,
      无效文件关联: impact.impact.invalidFileAssociations,
      可安全删除: impact.impact.canDeleteSafely
    });
    
    res.json({
      success: true,
      data: impact,
      message: `标签删除影响分析完成`
    });
    
  } catch (error) {
    console.error('获取标签删除影响分析失败:', error);
    res.status(500).json({
      success: false,
      message: '获取删除影响分析失败',
      error: error.message
    });
  }
});

// 🔧 修复：手动清理无效文件关联的API端点 - 修复调用方式
router.post('/:id/cleanup', async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    
    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: '无效的标签ID'
      });
    }
    
    console.log(`🧹 手动清理标签${tagId}的无效文件关联...`);
    
    const tag = database.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: '标签不存在'
      });
    }
    
    // 🔧 修复调用方式
    const cleanupResult = database.tags.cleanupInvalidFileAssociations(tagId);
    
    console.log(`✅ 标签"${tag.name}"无效关联清理完成: ${cleanupResult.cleaned}/${cleanupResult.total}`);
    
    res.json({
      success: true,
      message: `标签"${tag.name}"无效关联清理完成`,
      data: {
        tagName: tag.name,
        cleanedCount: cleanupResult.cleaned,
        totalCount: cleanupResult.total,
        remainingValid: cleanupResult.total - cleanupResult.cleaned
      }
    });
    
  } catch (error) {
    console.error('清理无效文件关联失败:', error);
    res.status(500).json({
      success: false,
      message: '清理无效文件关联失败',
      error: error.message
    });
  }
});

// 🏷️ 新增：获取可用的学习标签列表（实时统计版本） - 🔧 移除难度和时间相关逻辑
router.get('/tags', async (req, res) => {
  try {
    console.log('📚 获取可用的学习标签列表...');
    
    // 获取所有标签
    const allTags = database.tags.getAllTags();
    
    // 获取文件数据库引用
    const uploadModule = require('./upload');
    const { fileDatabase } = uploadModule;
    
    // 筛选出有可用文件的标签
    const availableTags = [];
    
    for (const tag of allTags) {
      try {
        // 🔔 实时获取标签下的文件
        const tagFiles = database.tags.getTagFiles(tag.id);
        
        // 🔔 实时检查是否有已完成分析的文件
        const validFiles = tagFiles.filter(tf => {
          const file = fileDatabase.find(f => f.id === tf.file_id);
          return file && file.status === 'completed' && file.aiAnalysis && file.content;
        });
        
        // 🔧 修复：只显示有有效文件的标签
        if (validFiles.length > 0) {
          // 🔧 学习内容功能已移除（数据库表已删除）
          const learningContent = null;
          
          availableTags.push({
            id: tag.id,
            name: tag.name,
            description: tag.description,
            color: tag.color,
            fileCount: validFiles.length, // 🔔 实时文件数量
            hasLearningContent: !!learningContent,
            // 🔔 实时计算综合统计信息
            totalStages: learningContent?.total_stages || Math.max(3, Math.ceil(validFiles.length * 1.5)),
            // 🔧 移除时间和难度字段
            createdAt: tag.created_at,
            lastUpdated: beijingTime.toBeijingISOString(), // 🔔 添加更新时间戳
            validFileDetails: validFiles.map(tf => {
              const file = fileDatabase.find(f => f.id === tf.file_id);
              return {
                id: file.id,
                name: file.originalName,
                status: file.status
              };
            })
          });
        }
      } catch (error) {
        console.warn(`处理标签 ${tag.name} 时出错:`, error);
      }
    }
      res.json({
      success: true,
      data: availableTags,
      total: availableTags.length,
      timestamp: beijingTime.toBeijingISOString(), // 🔔 添加响应时间戳
      message: availableTags.length > 0 ? 
        `找到 ${availableTags.length} 个可用的学习标签` :
        '暂无可用的学习标签'
    });
    
  } catch (error) {
    console.error('❌ 获取学习标签失败:', error);
    res.status(500).json({
      success: false,
      message: '获取学习标签失败',
      error: error.message
    });
  }
});

// 获取标签下的文件（带排序）- AdminTagFileOrderPage 需要
router.get('/:tagId/files', requireAuth, async (req, res) => {
  try {
    const { tagId } = req.params;
    
    // 先尝试从 tag_file_order 表获取排序后的文件
    let files = [];
    try {
      files = database.tagFileOrder.getFilesByTagOrdered(tagId);
    } catch (error) {
      console.log('未找到排序数据，使用默认文件列表:', error.message);
    }
    
    if (!files || files.length === 0) {
      // 如果没有排序数据，获取该标签下的所有文件
      files = database.tags.getTagFiles(tagId);
    }
    
    res.json({ success: true, data: files });
  } catch (error) {
    console.error('获取标签文件失败:', error);
    res.status(500).json({ success: false, message: '获取标签文件失败', error: error.message });
  }
});

// 设置标签下文件的排序 - AdminTagFileOrderPage 需要
router.post('/set-file-order', requireAuth, async (req, res) => {
  try {
    const { tagId, fileIdOrder } = req.body;
    
    if (!tagId || !Array.isArray(fileIdOrder)) {
      return res.status(400).json({ success: false, message: '参数错误：需要 tagId 和 fileIdOrder 数组' });
    }
    
    console.log('设置文件排序:', { tagId, fileIdOrder });
    
    let success = false;
    try {
      success = database.tagFileOrder.setTagFileOrder(tagId, fileIdOrder);
    } catch (error) {
      console.error('调用排序方法失败:', error);
      // 如果方法不存在，手动实现
      try {
        // 先删除现有排序
        database.run('DELETE FROM tag_file_order WHERE tag_id = ?', [tagId]);
        
        // 插入新排序
        const stmt = database.db.prepare('INSERT INTO tag_file_order (tag_id, file_id, order_index) VALUES (?, ?, ?)');
        for (let i = 0; i < fileIdOrder.length; i++) {
          stmt.run(tagId, fileIdOrder[i], i);
        }
        success = true;
      } catch (manualError) {
        console.error('手动设置排序失败:', manualError);
        success = false;
      }
    }
    
    if (success) {
      res.json({ success: true, message: '文件排序设置成功' });
    } else {
      res.status(500).json({ success: false, message: '文件排序设置失败' });
    }
  } catch (error) {
    console.error('设置文件排序失败:', error);
    res.status(500).json({ success: false, message: '设置文件排序失败', error: error.message });
  }
});

module.exports = router;
