const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据库目录存在
const dbDir = path.dirname(__filename);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, 'knowledge_platform.db');
console.log('数据库路径:', dbPath);

// 创建数据库连接
const db = new Database(dbPath);

// 初始化数据库表
const initDatabase = () => {
  try {
    // 创建用户表（添加role字段）
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 检查是否已存在role列，如果不存在则添加
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasRoleColumn = tableInfo.some(column => column.name === 'role');
    
    if (!hasRoleColumn) {
      db.exec(`ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'`);
      console.log('✅ 已添加role字段到users表');
    }

    // 创建默认管理员账户（如果不存在）
    const crypto = require('crypto');
    const adminEmail = 'admin@cem.com';
    const adminPassword = 'admin123'; // 建议在生产环境中使用更复杂的密码
    const adminPasswordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');
    
    const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
    if (!existingAdmin) {
      db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(
        adminEmail, 
        adminPasswordHash, 
        'admin'
      );
      console.log('✅ 默认管理员账户已创建: admin@cem.com / admin123');
    }

    // 将指定用户更新为管理员（如果存在）
    const targetEmail = 'dc22956@um.edu.mo';
    const targetUser = db.prepare('SELECT * FROM users WHERE email = ?').get(targetEmail);
    if (targetUser) {
      const updateResult = db.prepare('UPDATE users SET role = ? WHERE email = ?').run('admin', targetEmail);
      if (updateResult.changes > 0) {
        console.log(`✅ 用户 ${targetEmail} 已更新为超级管理员账户`);
      }
    }

    // 检查并更新所有现有用户的默认角色（修复SQL语法）
    db.prepare('UPDATE users SET role = ? WHERE role IS NULL OR role = ?').run('user', '');

    // 🏷️ 新增：创建标签表
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(50) DEFAULT '#1890ff',
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🏷️ 新增：创建文件-标签关联表
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id VARCHAR(255) NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_id, tag_id)
      )
    `);

    // 修改学习进度表，支持基于标签的学习
    db.exec(`
      CREATE TABLE IF NOT EXISTS learning_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tag_id INTEGER,
        file_id VARCHAR(255),
        current_stage INTEGER DEFAULT 1,
        total_stages INTEGER NOT NULL,
        stage_scores TEXT,
        final_score REAL DEFAULT 0,
        completed BOOLEAN DEFAULT FALSE,
        learning_type VARCHAR(50) DEFAULT 'file',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);    // 检查并添加新字段到已存在的学习进度表
    const progressTableInfo = db.prepare("PRAGMA table_info(learning_progress)").all();
    const hasTagIdColumn = progressTableInfo.some(column => column.name === 'tag_id');
    const hasLearningTypeColumn = progressTableInfo.some(column => column.name === 'learning_type');
    const hasTestScoreColumn = progressTableInfo.some(column => column.name === 'test_score');
    
    if (!hasTagIdColumn) {
      db.exec(`ALTER TABLE learning_progress ADD COLUMN tag_id INTEGER`);
      console.log('✅ 已添加tag_id字段到learning_progress表');
    }
    
    if (!hasLearningTypeColumn) {
      db.exec(`ALTER TABLE learning_progress ADD COLUMN learning_type VARCHAR(50) DEFAULT 'file'`);
      console.log('✅ 已添加learning_type字段到learning_progress表');
    }

    if (!hasTestScoreColumn) {
      db.exec(`ALTER TABLE learning_progress ADD COLUMN test_score INTEGER`);
      console.log('✅ 已添加test_score字段到learning_progress表');
    }

    // 🏷️ 新增：创建标签学习内容表（存储基于标签的合并学习内容）
    db.exec(`
      CREATE TABLE IF NOT EXISTS tag_learning_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id INTEGER NOT NULL,
        merged_content TEXT,
        ai_analysis TEXT,
        learning_stages TEXT,
        total_stages INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🏷️ 新增：创建测试会话表，支持基于标签的测试
    db.exec(`
      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id VARCHAR(255) NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        tag_id INTEGER,
        file_id VARCHAR(255),
        test_type VARCHAR(50) DEFAULT 'comprehensive',
        difficulty VARCHAR(50),
        total_questions INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        final_score REAL DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // 创建知识库文件表
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建知识点表
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        stage INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🔧 修复：创建文件记录表，添加缺失的字段
    db.exec(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id VARCHAR(255) PRIMARY KEY,
        original_name VARCHAR(500) NOT NULL,
        upload_path VARCHAR(1000) NOT NULL,
        file_size INTEGER NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        content TEXT,
        ai_analysis TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        last_modified DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 🔧 检查并添加缺失的字段到已存在的文件表
    const fileTableInfo = db.prepare("PRAGMA table_info(uploaded_files)").all();
    const hasLastModifiedColumn = fileTableInfo.some(column => column.name === 'last_modified');
    const hasErrorMessageColumn = fileTableInfo.some(column => column.name === 'error_message');
    
    if (!hasLastModifiedColumn) {
      db.exec(`ALTER TABLE uploaded_files ADD COLUMN last_modified DATETIME DEFAULT CURRENT_TIMESTAMP`);
      console.log('✅ 已添加last_modified字段到uploaded_files表');
    }
    
    if (!hasErrorMessageColumn) {
      db.exec(`ALTER TABLE uploaded_files ADD COLUMN error_message TEXT`);
      console.log('✅ 已添加error_message字段到uploaded_files表');
    }

    // 🏷️ 创建一些默认标签（如果不存在）
    const defaultTags = [
      { name: '技术文档', description: '技术相关的学习资料', color: '#1890ff' },
      { name: '培训材料', description: '员工培训相关内容', color: '#52c41a' },
      { name: '政策制度', description: '公司政策和制度文档', color: '#fa8c16' },
      { name: '操作手册', description: '操作指南和手册', color: '#722ed1' },
      { name: '学习资料', description: '通用学习资料', color: '#13c2c2' }
    ];

    for (const tag of defaultTags) {
      const existingTag = db.prepare('SELECT * FROM tags WHERE name = ?').get(tag.name);
      if (!existingTag) {
        db.prepare('INSERT INTO tags (name, description, color, created_by) VALUES (?, ?, ?, ?)').run(
          tag.name, 
          tag.description, 
          tag.color, 
          1 // 假设第一个用户是管理员
        );
        console.log(`✅ 创建默认标签: ${tag.name}`);
      }
    }

    console.log('✅ 数据库初始化成功 - 已支持基于标签的学习系统');
    console.log('✅ 数据库初始化成功 - 已支持文件持久化存储');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
  }
};

// 初始化数据库
initDatabase();

// 🏷️ 新增：标签相关的数据库操作函数
const tagOperations = {
  // 获取所有标签
  getAllTags: function() {
    try {
      return db.prepare('SELECT * FROM tags ORDER BY created_at DESC').all();
    } catch (error) {
      console.error('获取标签列表失败:', error);
      throw error;
    }
  },

  // 创建新标签
  createTag: function(name, description, color, createdBy) {
    try {
      return db.prepare('INSERT INTO tags (name, description, color, created_by) VALUES (?, ?, ?, ?)').run(
        name, description, color, createdBy
      );
    } catch (error) {
      console.error('创建标签失败:', error);
      throw error;
    }
  },

  // 更新标签
  updateTag: function(tagId, name, description, color) {
    try {
      return db.prepare('UPDATE tags SET name = ?, description = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        name, description, color, tagId
      );
    } catch (error) {
      console.error('更新标签失败:', error);
      throw error;
    }
  },

  // 🔧 修复：清理无效的文件关联 - 移到前面定义
  cleanupInvalidFileAssociations: function(tagId) {
    try {
      console.log(`🧹 开始清理标签${tagId}的无效文件关联...`);
      
      // 获取所有文件关联
      const fileAssociations = db.prepare(`
        SELECT ft.file_id, ft.tag_id, ft.created_at
        FROM file_tags ft
        WHERE ft.tag_id = ?
      `).all(tagId);
      
      if (fileAssociations.length === 0) {
        console.log('ℹ️ 没有找到文件关联需要清理');
        return { cleaned: 0, total: 0 };
      }
      
      console.log(`📋 找到${fileAssociations.length}个文件关联，开始验证...`);
      
      let cleanedCount = 0;
      const fs = require('fs-extra');
      
      try {
        // 获取内存中的文件数据库
        const uploadModule = require('../routes/upload');
        const { fileDatabase } = uploadModule;
        
        for (const assoc of fileAssociations) {
          const fileId = assoc.file_id;
          let shouldClean = false;
          let reason = '';
          
          // 检查内存数据库
          const memoryFile = fileDatabase.find(f => f.id === fileId);
          if (!memoryFile) {
            shouldClean = true;
            reason = '内存中文件记录不存在';
          } else {
            // 检查数据库记录
            const dbFile = fileOperations.getFile(fileId);
            if (!dbFile) {
              shouldClean = true;
              reason = '数据库文件记录不存在';
            } else {
              // 检查物理文件
              const filePath = memoryFile.uploadPath || dbFile.uploadPath;
              if (!fs.existsSync(filePath)) {
                shouldClean = true;
                reason = '物理文件不存在';
              }
            }
          }
          
          if (shouldClean) {
            console.log(`🗑️ 清理无效关联: 文件${fileId} (${reason})`);
            
            try {
              this.removeFileTag(fileId, tagId);
              cleanedCount++;
            } catch (removeError) {
              console.warn(`清理文件${fileId}关联失败:`, removeError);
            }
          }
        }
        
      } catch (verifyError) {
        console.warn('验证文件关联时出错:', verifyError);
      }
      
      console.log(`✅ 清理完成: ${cleanedCount}/${fileAssociations.length} 个无效关联已清理`);
      
      return {
        cleaned: cleanedCount,
        total: fileAssociations.length
      };
      
    } catch (error) {
      console.error('清理无效文件关联失败:', error);
      throw error;
    }
  },

  // 删除标签 - 🔧 修复this指向问题
  deleteTag: function(tagId) {
    try {
      console.log(`🗑️ 开始删除标签: ${tagId}`);
      // 🔧 在删除前先清理无效的文件关联 - 修复this调用
      try {
        console.log('🧹 删除前检查并清理无效文件关联...');
        tagOperations.cleanupInvalidFileAssociations(tagId);
      } catch (cleanupError) {
        console.warn('清理无效文件关联时出错:', cleanupError);
        // 继续执行删除流程
      }
      // 使用事务确保数据一致性
      const deleteTransaction = db.transaction(() => {
        // 1. 删除文件-标签关联
        const fileTagsResult = db.prepare('DELETE FROM file_tags WHERE tag_id = ?').run(tagId);
        console.log(`🧹 清理文件标签关联: ${fileTagsResult.changes} 条记录`);
        // 1.1 删除标签文件顺序表关联
        const orderResult = db.prepare('DELETE FROM tag_file_order WHERE tag_id = ?').run(tagId);
        console.log(`🧹 清理标签文件顺序: ${orderResult.changes} 条记录`);
        // 2. 删除标签学习内容
        const learningContentResult = db.prepare('DELETE FROM tag_learning_content WHERE tag_id = ?').run(tagId);
        console.log(`🧹 清理学习内容: ${learningContentResult.changes} 条记录`);
        // 3. 删除学习进度记录
        const progressResult = db.prepare('DELETE FROM learning_progress WHERE tag_id = ?').run(tagId);
        console.log(`🧹 清理学习进度: ${progressResult.changes} 条记录`);
        // 4. 删除测试会话记录
        const quizResult = db.prepare('DELETE FROM quiz_sessions WHERE tag_id = ?').run(tagId);
        console.log(`🧹 清理测试会话: ${quizResult.changes} 条记录`);
        // 5. 最后删除标签本身
        const tagResult = db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
        console.log(`🗑️ 删除标签: ${tagResult.changes} 条记录`);
        return {
          fileTagsDeleted: fileTagsResult.changes,
          tagFileOrderDeleted: orderResult.changes,
          learningContentDeleted: learningContentResult.changes,
          progressDeleted: progressResult.changes,
          quizSessionsDeleted: quizResult.changes,
          tagDeleted: tagResult.changes,
          changes: tagResult.changes // 主要返回值，表示标签是否成功删除
        };
      });
      const result = deleteTransaction();
      console.log(`✅ 标签删除完成:`, result);
      return result;
    } catch (error) {
      console.error('删除标签失败:', error);
      throw error;
    }
  },

  // 强制删除标签（包含完整清理） - 🔧 修复this指向问题
  forceDeleteTag: function(tagId) {
    try {
      console.log(`🚨 强制删除标签: ${tagId}`);
      
      // 获取要删除的标签信息
      const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
      if (!tag) {
        throw new Error(`标签 ${tagId} 不存在`);
      }
      
      // 获取关联的文件信息
      const associatedFiles = db.prepare(`
        SELECT ft.file_id, ft.created_at 
        FROM file_tags ft 
        WHERE ft.tag_id = ?
      `).all(tagId);
      
      console.log(`📋 标签 "${tag.name}" 关联了 ${associatedFiles.length} 个文件`);
      
      // 执行完整的级联删除 - 修复this调用
      const result = tagOperations.deleteTag(tagId);
      
      return {
        ...result,
        deletedTag: tag,
        affectedFiles: associatedFiles,
        message: `强制删除标签 "${tag.name}" 成功，清理了 ${associatedFiles.length} 个文件关联`
      };
      
    } catch (error) {
      console.error('强制删除标签失败:', error);
      throw error;
    }
  },

  // 批量删除标签（支持强制删除） - 🔧 修复this指向问题
  batchDeleteTags: function(tagIds, force = false) {
    try {
      console.log(`🔄 批量删除标签: ${tagIds.length} 个，强制模式: ${force}`);
      
      const results = {
        successful: [],
        failed: [],
        totalAffectedFiles: 0
      };
      
      for (const tagId of tagIds) {
        try {
          if (force) {
            const result = tagOperations.forceDeleteTag(tagId);
            results.successful.push({
              tagId: tagId,
              tagName: result.deletedTag.name,
              affectedFiles: result.affectedFiles.length,
              details: result
            });
            results.totalAffectedFiles += result.affectedFiles.length;
          } else {
            // 检查是否有文件关联
            const fileCount = db.prepare('SELECT COUNT(*) as count FROM file_tags WHERE tag_id = ?').get(tagId);
            if (fileCount.count > 0) {
              results.failed.push({
                tagId: tagId,
                reason: `标签下有 ${fileCount.count} 个文件，需要强制删除`,
                requiresForce: true
              });
              continue;
            }
            
            const result = tagOperations.deleteTag(tagId);
            if (result.changes > 0) {
              results.successful.push({
                tagId: tagId,
                affectedFiles: 0,
                details: result
              });
            } else {
              results.failed.push({
                tagId: tagId,
                reason: '标签不存在或已被删除'
              });
            }
          }
        } catch (error) {
          results.failed.push({
            tagId: tagId,
            reason: error.message,
            error: true
          });
        }
      }
      
      console.log(`✅ 批量删除完成: 成功 ${results.successful.length}，失败 ${results.failed.length}`);
      return results;
      
    } catch (error) {
      console.error('批量删除标签失败:', error);
      throw error;
    }
  },

  // 获取标签删除影响分析 - 🔧 修复this指向问题
  getDeleteImpactAnalysis: function(tagId) {
    try {
      const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
      if (!tag) {
        return null;
      }
      
      // 获取关联的文件
      const associatedFiles = db.prepare(`
        SELECT ft.file_id, ft.created_at as associated_at
        FROM file_tags ft
        WHERE ft.tag_id = ?
        ORDER BY ft.created_at DESC
      `).all(tagId);
      
      // 🔧 新增：验证文件是否真实存在（检查内存数据库和物理文件）
      let validFileCount = 0;
      const validFiles = [];
      const invalidFiles = [];
      
      try {
        // 获取内存中的文件数据库
        const uploadModule = require('../routes/upload');
        const { fileDatabase } = uploadModule;
        
        for (const fileAssoc of associatedFiles) {
          const fileId = fileAssoc.file_id;
          
          // 检查内存数据库中是否存在
          const memoryFile = fileDatabase.find(f => f.id === fileId);
          
          // 检查数据库记录是否存在
          const dbFile = fileOperations.getFile(fileId);
          
          if (memoryFile && dbFile) {
            // 进一步检查物理文件是否存在
            const fs = require('fs-extra');
            const physicalExists = fs.existsSync(memoryFile.uploadPath || dbFile.uploadPath);
            
            if (physicalExists) {
              validFileCount++;
              validFiles.push({
                ...fileAssoc,
                fileName: memoryFile.originalName || dbFile.originalName,
                status: memoryFile.status || dbFile.status
              });
            } else {
              invalidFiles.push({
                ...fileAssoc,
                reason: '物理文件不存在'
              });
            }
          } else {
            invalidFiles.push({
              ...fileAssoc,
              reason: memoryFile ? '数据库记录不存在' : '内存记录不存在'
            });
          }
        }
        
        // 🔧 如果发现无效文件关联，自动清理 - 修复this调用
        if (invalidFiles.length > 0) {
          console.log(`🧹 发现${invalidFiles.length}个无效的文件关联，开始清理...`);
          
          for (const invalidFile of invalidFiles) {
            try {
              tagOperations.removeFileTag(invalidFile.file_id, tagId);
              console.log(`✅ 已清理无效文件关联: ${invalidFile.file_id}`);
            } catch (cleanError) {
              console.warn(`清理无效文件关联失败: ${invalidFile.file_id}`, cleanError);
            }
          }
        }
        
      } catch (verifyError) {
        console.warn('验证文件存在性时出错:', verifyError);
        // 如果验证过程出错，使用原始数量（保守处理）
        validFileCount = associatedFiles.length;
      }
      
      // 获取学习内容
      const learningContent = db.prepare('SELECT * FROM tag_learning_content WHERE tag_id = ?').get(tagId);
      
      // 获取学习进度
      const learningProgress = db.prepare('SELECT COUNT(*) as count FROM learning_progress WHERE tag_id = ?').get(tagId);
      
      // 获取测试会话
      const quizSessions = db.prepare('SELECT COUNT(*) as count FROM quiz_sessions WHERE tag_id = ?').get(tagId);
      
      console.log(`📊 标签${tagId}删除影响分析: 原始关联${associatedFiles.length}个, 有效关联${validFileCount}个, 无效关联${invalidFiles.length}个`);
      
      return {
        tag: tag,
        impact: {
          fileAssociations: validFileCount, // 🔧 使用验证后的有效文件数量
          originalFileAssociations: associatedFiles.length, // 保留原始数量供参考
          invalidFileAssociations: invalidFiles.length,
          hasLearningContent: !!learningContent,
          learningProgressRecords: learningProgress.count,
          quizSessionRecords: quizSessions.count,
          canDeleteSafely: validFileCount === 0, // 🔧 基于有效文件数量判断
          requiresForce: validFileCount > 0
        },
        details: {
          validFiles: validFiles, // 🔧 有效文件列表
          invalidFiles: invalidFiles, // 🔧 无效文件列表
          associatedFiles: associatedFiles, // 保留原始关联供参考
          learningContent: learningContent,
          warnings: validFileCount > 0 ? [
            `删除将影响 ${validFileCount} 个有效文件的标签关联`,
            learningContent ? '将删除已生成的学习内容' : null,
            learningProgress.count > 0 ? `将删除 ${learningProgress.count} 条学习进度记录` : null,
            quizSessions.count > 0 ? `将删除 ${quizSessions.count} 条测试记录` : null
          ].filter(Boolean) : []
        }
      };
      
    } catch (error) {
      console.error('获取删除影响分析失败:', error);
      throw error;
    }
  },

  // 获取标签下的所有文件 - 🔧 修复this指向问题
  getTagFiles: function(tagId) {
    try {
      const files = db.prepare(`
        SELECT ft.file_id, ft.created_at as tag_assigned_at
        FROM file_tags ft
        WHERE ft.tag_id = ?
        ORDER BY ft.created_at DESC
      `).all(tagId);
      
      // 🔧 验证文件是否真实存在
      const validFiles = [];
      const fs = require('fs-extra');
      
      try {
        const uploadModule = require('../routes/upload');
        const { fileDatabase } = uploadModule;
        
        for (const fileRef of files) {
          const fileId = fileRef.file_id;
          const memoryFile = fileDatabase.find(f => f.id === fileId);
          const dbFile = fileOperations.getFile(fileId);
          
          if (memoryFile && dbFile) {
            const filePath = memoryFile.uploadPath || dbFile.uploadPath;
            if (fs.existsSync(filePath)) {
              validFiles.push(fileRef);
            }
          }
        }
        
        // 🔧 如果发现有无效文件，清理它们
        if (validFiles.length < files.length) {
          const invalidCount = files.length - validFiles.length;
          console.log(`⚠️ 标签${tagId}发现${invalidCount}个无效文件关联，建议清理`);
        }
        
      } catch (verifyError) {
        console.warn('验证标签文件时出错:', verifyError);
        // 如果验证失败，返回原始列表
        return files;
      }
      
      console.log(`📋 获取标签${tagId}的文件: ${validFiles.length} 个有效文件 (原${files.length}个)`);
      return validFiles;
    } catch (error) {
      console.error('获取标签文件失败:', error);
      return [];
    }
  },
  // 为文件添加标签 - 增强错误处理，同时自动添加排序
  addFileTag: function(fileId, tagId) {
    try {
      console.log(`🔗 添加文件标签关联: 文件${fileId} -> 标签${tagId}`);
      
      // 检查关联是否已存在
      const existing = db.prepare('SELECT id FROM file_tags WHERE file_id = ? AND tag_id = ?').get(fileId, tagId);
      if (existing) {
        console.log(`ℹ️ 文件${fileId}和标签${tagId}的关联已存在`);
        return { changes: 0, message: '关联已存在' };
      }
      
      // 添加新关联
      const result = db.prepare('INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)').run(fileId, tagId);
      
      // 🔄 自动添加到 tag_file_order 表，按添加顺序排序
      try {
        // 检查是否已有排序记录
        const orderExists = db.prepare('SELECT id FROM tag_file_order WHERE tag_id = ? AND file_id = ?').get(tagId, fileId);
        if (!orderExists) {
          // 获取该标签下当前最大的 order_index
          const maxOrder = db.prepare('SELECT MAX(order_index) as max_order FROM tag_file_order WHERE tag_id = ?').get(tagId);
          const nextOrder = (maxOrder?.max_order || -1) + 1;
          
          // 插入排序记录
          db.prepare('INSERT INTO tag_file_order (tag_id, file_id, order_index) VALUES (?, ?, ?)').run(tagId, fileId, nextOrder);
          console.log(`✅ 自动添加文件排序: 标签${tagId}下文件${fileId}排序${nextOrder}`);
        }
      } catch (orderError) {
        console.warn('添加文件排序失败:', orderError);
        // 不影响主要功能，继续执行
      }
      
      console.log(`✅ 文件标签关联添加成功: ${result.changes} 行受影响`);
      return result;
    } catch (error) {
      console.error('添加文件标签失败:', error);
      throw error;
    }
  },
  // 移除文件标签 - 增强错误处理，同时移除排序记录
  removeFileTag: function(fileId, tagId) {
    try {
      console.log(`🗑️ 移除文件标签关联: 文件${fileId} -> 标签${tagId}`);
      
      const result = db.prepare('DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?').run(fileId, tagId);
      
      // 🔄 同时移除 tag_file_order 表中的排序记录
      try {
        const orderResult = db.prepare('DELETE FROM tag_file_order WHERE tag_id = ? AND file_id = ?').run(tagId, fileId);
        if (orderResult.changes > 0) {
          console.log(`✅ 同时移除文件排序记录: ${orderResult.changes} 行`);
        }
      } catch (orderError) {
        console.warn('移除文件排序记录失败:', orderError);
        // 不影响主要功能，继续执行
      }
      
      console.log(`✅ 文件标签关联移除完成: ${result.changes} 行受影响`);
      return result;
    } catch (error) {
      console.error('移除文件标签失败:', error);
      throw error;
    }
  },

  // 获取文件的所有标签 - 增强数据返回
  getFileTags: (fileId) => {
    try {
      const tags = db.prepare(`
        SELECT t.*, ft.created_at as tag_assigned_at
        FROM tags t
        JOIN file_tags ft ON t.id = ft.tag_id
        WHERE ft.file_id = ?
        ORDER BY ft.created_at DESC      `).all(fileId);
      
      // 只在有标签时记录日志
      if (tags.length > 0) {
        console.log(`📋 获取文件${fileId}的标签: ${tags.length} 个`);
      }
      return tags;
    } catch (error) {
      console.error('获取文件标签失败:', error);
      return [];
    }
  },

  // 🔧 新增：获取标签的文件统计信息
  getTagFileStats: (tagId) => {
    try {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_files,
          MAX(ft.created_at) as last_file_added
        FROM file_tags ft
        WHERE ft.tag_id = ?
      `).get(tagId);
      
      return stats || { total_files: 0, last_file_added: null };
    } catch (error) {
      console.error('获取标签文件统计失败:', error);
      return { total_files: 0, last_file_added: null };
    }
  },

  // 🔧 新增：批量移除文件的所有标签
  removeAllFileTags: (fileId) => {
    try {
      console.log(`🗑️ 移除文件${fileId}的所有标签`);
      
      const result = db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileId);
      console.log(`✅ 文件所有标签移除完成: ${result.changes} 行受影响`);
      return result;
    } catch (error) {
      console.error('移除文件所有标签失败:', error);
      throw error;
    }
  },

  // 🔧 新增：查找没有任何文件的标签
  getUnusedTags: () => {
    try {
      const unusedTags = db.prepare(`
        SELECT t.*
        FROM tags t
        LEFT JOIN file_tags ft ON t.id = ft.tag_id
        WHERE ft.tag_id IS NULL
        ORDER BY t.created_at DESC
      `).all();
      
      console.log(`📋 找到 ${unusedTags.length} 个未使用的标签`);
      return unusedTags;
    } catch (error) {
      console.error('获取未使用标签失败:', error);
      return [];
    }
  },

  // 保存标签的合并学习内容
  saveTagLearningContent: (tagId, mergedContent, aiAnalysis, learningStages, totalStages) => {
    try {
      const existing = db.prepare('SELECT id FROM tag_learning_content WHERE tag_id = ?').get(tagId);
      
      if (existing) {
        return db.prepare(`
          UPDATE tag_learning_content 
          SET merged_content = ?, ai_analysis = ?, learning_stages = ?, total_stages = ?, updated_at = CURRENT_TIMESTAMP
          WHERE tag_id = ?
        `).run(mergedContent, aiAnalysis, learningStages, totalStages, tagId);
      } else {
        return db.prepare(`
          INSERT INTO tag_learning_content (tag_id, merged_content, ai_analysis, learning_stages, total_stages)
          VALUES (?, ?, ?, ?, ?)
        `).run(tagId, mergedContent, aiAnalysis, learningStages, totalStages);
      }
    } catch (error) {
      console.error('保存标签学习内容失败:', error);
      throw error;
    }
  },

  // 获取标签的学习内容
  getTagLearningContent: (tagId) => {
    try {
      return db.prepare('SELECT * FROM tag_learning_content WHERE tag_id = ?').get(tagId);
    } catch (error) {
      console.error('获取标签学习内容失败:', error);
      throw error;
    }
  }
};

// 🔧 修复：文件记录相关的数据库操作函数 - 修复字段映射
const fileOperations = {
  // 保存文件记录 - 修复版本，处理所有字段
  saveFile: (fileData) => {
    try {
      console.log(`💾 保存文件记录到数据库: ${fileData.originalName}`);
      
      // 🔧 修复：确保所有必需字段都有值
      const now = new Date().toISOString();
      const createdAt = fileData.createdAt ? new Date(fileData.createdAt).toISOString() : now;
      const processedAt = fileData.processedAt ? new Date(fileData.processedAt).toISOString() : null;
      const aiAnalysisStr = fileData.aiAnalysis ? JSON.stringify(fileData.aiAnalysis) : null;
      
      return db.prepare(`
        INSERT OR REPLACE INTO uploaded_files 
        (id, original_name, upload_path, file_size, file_type, status, content, ai_analysis, error_message, created_at, processed_at, last_modified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileData.id,
        fileData.originalName,
        fileData.uploadPath,
        fileData.fileSize,
        fileData.fileType,
        fileData.status || 'uploaded',
        fileData.content || null,
        aiAnalysisStr,
        fileData.error || null,
        createdAt,
        processedAt,
        now
      );
    } catch (error) {
      console.error('❌ 保存文件记录失败:', error);
      throw error;
    }
  },

  // 获取所有文件记录 - 增强版本，完整还原数据结构 - 🔧 修复 JSON 解析
  getAllFiles: () => {
    try {
      const files = db.prepare('SELECT * FROM uploaded_files ORDER BY created_at DESC').all();
      
      console.log(`📋 从数据库获取 ${files.length} 个文件记录`);
      
      // 转换数据库记录为内存格式
      return files.map(file => {
        let aiAnalysis = null;
        try {
          if (file.ai_analysis) {
            // 🔧 修复：安全检查 AI 分析数据的类型
            if (typeof file.ai_analysis === 'string') {
              try {
                aiAnalysis = JSON.parse(file.ai_analysis);
              } catch (parseError) {
                console.warn(`解析文件 ${file.id} 的AI分析数据失败:`, parseError.message);
                console.warn(`原始数据类型: ${typeof file.ai_analysis}, 内容: ${file.ai_analysis.substring(0, 100)}...`);
                aiAnalysis = null;
              }
            } else if (typeof file.ai_analysis === 'object') {
              // 如果已经是对象，直接使用
              aiAnalysis = file.ai_analysis;
            } else {
              console.warn(`文件 ${file.id} 的AI分析数据类型异常: ${typeof file.ai_analysis}`);
              aiAnalysis = null;
            }
          }
        } catch (parseError) {
          console.warn(`处理文件 ${file.id} 的AI分析数据时出错:`, parseError);
          aiAnalysis = null;
        }
        
        const uploadTimestamp = new Date(file.created_at).getTime();
        
        return {
          id: file.id,
          originalName: file.original_name,
          uploadPath: file.upload_path,
          fileSize: file.file_size,
          fileType: file.file_type,
          status: file.status,
          content: file.content,
          aiAnalysis: aiAnalysis,
          createdAt: uploadTimestamp,
          processedAt: file.processed_at,
          uploadTime: file.created_at,
          uploadTimestamp: uploadTimestamp,
          relativeTime: getRelativeTime(uploadTimestamp),
          hasAIResults: !!aiAnalysis,
          stages: aiAnalysis?.learningStages?.length || 0,
          keyPoints: aiAnalysis?.keyPoints?.length || 0,
          difficulty: aiAnalysis?.difficulty || '未知',
          estimatedTime: aiAnalysis?.estimatedLearningTime || '未知',
          aiSummary: aiAnalysis?.summary,
          tags: [] // 标签信息需要单独加载
        };
      });
    } catch (error) {
      console.error('❌ 获取文件记录失败:', error);
      return [];
    }
  },

  // 更新文件记录 - 修复版本，正确处理字段映射
  updateFile: (fileId, updates) => {
    try {
      console.log(`💾 更新文件记录: ${fileId}`, Object.keys(updates));
      
      // 🔧 修复：字段映射表，确保所有字段都正确
      const allowedFields = {
        'status': 'status',
        'content': 'content', 
        'aiAnalysis': 'ai_analysis',
        'processedAt': 'processed_at',
        'originalName': 'original_name',
        'uploadPath': 'upload_path',
        'fileSize': 'file_size',
        'fileType': 'file_type',
        'error': 'error_message'
      };
      
      const setClause = [];
      const values = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields[key]) {
          setClause.push(`${allowedFields[key]} = ?`);
          
          if (key === 'aiAnalysis') {
            values.push(value ? JSON.stringify(value) : null);
          } else if (key === 'processedAt') {
            values.push(value ? new Date(value).toISOString() : null);
          } else {
            values.push(value);
          }
        }
      }
      
      if (setClause.length === 0) {
        console.warn('⚠️ 没有有效的更新字段');
        return { changes: 0 };
      }
      
      // 总是更新 last_modified
      setClause.push('last_modified = ?');
      values.push(new Date().toISOString());
      values.push(fileId);

      const sql = `UPDATE uploaded_files SET ${setClause.join(', ')} WHERE id = ?`;
      console.log('🔍 执行SQL:', sql);
      
      return db.prepare(sql).run(...values);
    } catch (error) {
      console.error('❌ 更新文件记录失败:', error);
      throw error;
    }
  },

  // 删除文件记录 - 🔧 修复：先清理所有外键引用
  deleteFile: (fileId) => {
    try {
      console.log(`🗑️ 开始删除文件记录和相关数据: ${fileId}`);
      
      // 开始事务
      const deleteTransaction = db.transaction(() => {
        let totalDeleted = 0;
        
        // 1. 删除文件-标签关联
        try {
          const fileTagsResult = db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileId);
          if (fileTagsResult.changes > 0) {
            console.log(`🏷️ 删除了 ${fileTagsResult.changes} 个文件-标签关联`);
            totalDeleted += fileTagsResult.changes;
          }
        } catch (error) {
          console.warn('删除文件-标签关联失败:', error);
        }
        
        // 2. 删除标签文件排序
        try {
          const tagFileOrderResult = db.prepare('DELETE FROM tag_file_order WHERE file_id = ?').run(fileId);
          if (tagFileOrderResult.changes > 0) {
            console.log(`📋 删除了 ${tagFileOrderResult.changes} 个标签文件排序记录`);
            totalDeleted += tagFileOrderResult.changes;
          }
        } catch (error) {
          console.warn('删除标签文件排序失败:', error);
        }
        
        // 3. 删除文件用户可见性
        try {
          const fileVisibilityResult = db.prepare('DELETE FROM file_user_visibility WHERE file_id = ?').run(fileId);
          if (fileVisibilityResult.changes > 0) {
            console.log(`👁️ 删除了 ${fileVisibilityResult.changes} 个文件可见性记录`);
            totalDeleted += fileVisibilityResult.changes;
          }
        } catch (error) {
          console.warn('删除文件可见性失败:', error);
        }
        
        // 4. 删除学习进度记录
        try {
          const learningProgressResult = db.prepare('DELETE FROM learning_progress WHERE file_id = ?').run(fileId);
          if (learningProgressResult.changes > 0) {
            console.log(`📚 删除了 ${learningProgressResult.changes} 个学习进度记录`);
            totalDeleted += learningProgressResult.changes;
          }
        } catch (error) {
          console.warn('删除学习进度记录失败:', error);
        }
        
        // 5. 删除知识点记录（如果存在knowledge_files表的关联）
        try {
          // 先尝试通过uploaded_files的id删除knowledge_points
          const knowledgePointsResult = db.prepare('DELETE FROM knowledge_points WHERE file_id IN (SELECT id FROM knowledge_files WHERE filename = (SELECT original_name FROM uploaded_files WHERE id = ?))').run(fileId);
          if (knowledgePointsResult.changes > 0) {
            console.log(`🧠 删除了 ${knowledgePointsResult.changes} 个知识点记录`);
            totalDeleted += knowledgePointsResult.changes;
          }
        } catch (error) {
          console.warn('删除知识点记录失败:', error);
        }
        
        // 6. 删除相关的knowledge_files记录（如果存在）
        try {
          const knowledgeFilesResult = db.prepare('DELETE FROM knowledge_files WHERE filename = (SELECT original_name FROM uploaded_files WHERE id = ?)').run(fileId);
          if (knowledgeFilesResult.changes > 0) {
            console.log(`📖 删除了 ${knowledgeFilesResult.changes} 个知识文件记录`);
            totalDeleted += knowledgeFilesResult.changes;
          }
        } catch (error) {
          console.warn('删除知识文件记录失败:', error);
        }
        
        // 7. 最后删除主文件记录
        const mainResult = db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(fileId);
        if (mainResult.changes > 0) {
          console.log(`📄 删除了主文件记录`);
          totalDeleted += mainResult.changes;
        }
        
        console.log(`✅ 文件删除事务完成，总共删除了 ${totalDeleted} 条记录`);
        return mainResult;
      });
      
      return deleteTransaction();
      
    } catch (error) {
      console.error('❌ 删除文件记录失败:', error);
      throw error;
    }
  },

  // 获取单个文件记录 - 🔧 修复 JSON 解析
  getFile: (fileId) => {
    try {
      const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(fileId);
      if (!file) return null;

      let aiAnalysis = null;
      try {
        if (file.ai_analysis) {
          // 🔧 修复：安全检查 AI 分析数据的类型
          if (typeof file.ai_analysis === 'string') {
            try {
              aiAnalysis = JSON.parse(file.ai_analysis);
            } catch (parseError) {
              console.warn(`解析文件 ${fileId} 的AI分析数据失败:`, parseError.message);
              aiAnalysis = null;
            }
          } else if (typeof file.ai_analysis === 'object') {
            // 如果已经是对象，直接使用
            aiAnalysis = file.ai_analysis;
          } else {
            console.warn(`文件 ${fileId} 的AI分析数据类型异常: ${typeof file.ai_analysis}`);
            aiAnalysis = null;
          }
        }
      } catch (parseError) {
        console.warn(`处理文件 ${fileId} 的AI分析数据时出错:`, parseError);
        aiAnalysis = null;
      }

      const uploadTimestamp = new Date(file.created_at).getTime();

      return {
        id: file.id,
        originalName: file.original_name,
        uploadPath: file.upload_path,
        fileSize: file.file_size,
        fileType: file.file_type,
        status: file.status,
        content: file.content,
        aiAnalysis: aiAnalysis,
        createdAt: uploadTimestamp,
        processedAt: file.processed_at,
        uploadTime: file.created_at,
        uploadTimestamp: uploadTimestamp,
        tags: []
      };
    } catch (error) {
      console.error('❌ 获取文件记录失败:', error);
      return null;
    }
  },

  // 🔧 新增：检查文件记录是否存在
  fileExists: (fileId) => {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM uploaded_files WHERE id = ?').get(fileId);
      return result.count > 0;
    } catch (error) {
      console.error('❌ 检查文件存在性失败:', error);
      return false;
    }
  },

  // 🔧 新增：获取文件统计信息
  getFileStats: () => {
    try {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) as uploaded,
          SUM(file_size) as total_size
        FROM uploaded_files
      `).get();
      
      return stats;
    } catch (error) {
      console.error('❌ 获取文件统计失败:', error);
      return {
        total: 0,
        completed: 0,
        processing: 0,
        failed: 0,
        uploaded: 0,
        total_size: 0
      };
    }
  },

  // 🔧 新增：修复损坏的 AI 分析数据
  fixCorruptedAIAnalysis: () => {
    try {
      console.log('🔧 开始修复损坏的AI分析数据...');
      
      const files = db.prepare('SELECT id, original_name, ai_analysis FROM uploaded_files WHERE ai_analysis IS NOT NULL').all();
      let fixedCount = 0;
      let errorCount = 0;
      
      for (const file of files) {
        try {
          if (typeof file.ai_analysis === 'string') {
            // 尝试解析字符串
            try {
              JSON.parse(file.ai_analysis);
              // 如果解析成功，数据是正常的
              continue;
            } catch (parseError) {
              console.warn(`文件 ${file.original_name} 的AI分析数据损坏，设置为NULL`);
              
              // 清除损坏的数据
              db.prepare('UPDATE uploaded_files SET ai_analysis = NULL WHERE id = ?').run(file.id);
              fixedCount++;
            }
          }
        } catch (error) {
          console.error(`修复文件 ${file.original_name} 的AI分析数据失败:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ AI分析数据修复完成: 修复${fixedCount}个, 错误${errorCount}个`);
      return { fixed: fixedCount, errors: errorCount };
    } catch (error) {
      console.error('❌ 修复AI分析数据失败:', error);
      throw error;
    }
  }
};

// 辅助函数：生成相对时间显示
const getRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
};

// 🏷️ 新增：学习进度相关的数据库操作函数（基于标签）
const learningProgressOperations = {
  // 保存基于标签的学习进度
  saveTagProgress: (userId, tagId, currentStage, totalStages, completed = false) => {
    try {
      // 🔧 修复：确保所有参数都是正确的类型
      const userIdInt = parseInt(userId);
      const tagIdInt = parseInt(tagId);
      const currentStageInt = parseInt(currentStage);
      const totalStagesInt = parseInt(totalStages);
      const completedBool = Boolean(completed);
      
      console.log('💾 保存标签学习进度:', {
        userId: userIdInt,
        tagId: tagIdInt,
        currentStage: currentStageInt,
        totalStages: totalStagesInt,
        completed: completedBool
      });
      
      if (isNaN(userIdInt) || isNaN(tagIdInt) || isNaN(currentStageInt) || isNaN(totalStagesInt)) {
        throw new Error('参数类型错误：userId, tagId, currentStage, totalStages 必须是数字');
      }
      
      const existing = db.prepare('SELECT id FROM learning_progress WHERE user_id = ? AND tag_id = ?').get(userIdInt, tagIdInt);
      
      if (existing) {
        return db.prepare(`
          UPDATE learning_progress 
          SET current_stage = ?, total_stages = ?, completed = ?, learning_type = 'tag', updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND tag_id = ?
        `).run(currentStageInt, totalStagesInt, completedBool ? 1 : 0, userIdInt, tagIdInt);
      } else {
        return db.prepare(`
          INSERT INTO learning_progress (user_id, tag_id, current_stage, total_stages, completed, learning_type)
          VALUES (?, ?, ?, ?, ?, 'tag')
        `).run(userIdInt, tagIdInt, currentStageInt, totalStagesInt, completedBool ? 1 : 0);
      }
    } catch (error) {
      console.error('保存标签学习进度失败:', error);
      throw error;
    }
  },

  // 获取用户的标签学习进度
  getTagProgress: (userId, tagId) => {
    try {
      const userIdInt = parseInt(userId);
      const tagIdInt = parseInt(tagId);
      
      if (isNaN(userIdInt) || isNaN(tagIdInt)) {
        throw new Error('参数类型错误：userId, tagId 必须是数字');
      }
      
      return db.prepare('SELECT * FROM learning_progress WHERE user_id = ? AND tag_id = ?').get(userIdInt, tagIdInt);
    } catch (error) {
      console.error('获取标签学习进度失败:', error);
      throw error;
    }
  },

  // 获取用户的所有学习进度
  getUserAllProgress: (userId) => {
    try {
      const userIdInt = parseInt(userId);
      
      if (isNaN(userIdInt)) {
        throw new Error('参数类型错误：userId 必须是数字');
      }
      
      return db.prepare(`
        SELECT lp.*, t.name as tag_name, t.color as tag_color
        FROM learning_progress lp
        LEFT JOIN tags t ON lp.tag_id = t.id
        WHERE lp.user_id = ?
        ORDER BY lp.updated_at DESC
      `).all(userIdInt);
    } catch (error) {
      console.error('获取用户学习进度失败:', error);
      throw error;
    }
  },
  // 清理用户的学习进度
  clearUserProgress: (userId, tagId = null) => {
    try {
      const userIdInt = parseInt(userId);
      
      if (isNaN(userIdInt)) {
        throw new Error('参数类型错误：userId 必须是数字');
      }
      
      if (tagId) {
        const tagIdInt = parseInt(tagId);
        if (isNaN(tagIdInt)) {
          throw new Error('参数类型错误：tagId 必须是数字');
        }
        return db.prepare('DELETE FROM learning_progress WHERE user_id = ? AND tag_id = ?').run(userIdInt, tagIdInt);
      } else {
        return db.prepare('DELETE FROM learning_progress WHERE user_id = ?').run(userIdInt);
      }
    } catch (error) {
      console.error('清理学习进度失败:', error);
      throw error;
    }
  },

  // 🔧 新增：保存基于文件的学习进度（仅在学习完成且测试通过80分时保存）
  saveFileProgress: (userId, fileId, currentStage, totalStages, completed = false, testScore = null) => {
    try {
      const userIdInt = parseInt(userId);
      const currentStageInt = parseInt(currentStage);
      const totalStagesInt = parseInt(totalStages);
      const completedBool = Boolean(completed);
      const testScoreInt = testScore ? parseInt(testScore) : null;
      
      console.log('💾 保存文件学习进度:', {
        userId: userIdInt,
        fileId,
        currentStage: currentStageInt,
        totalStages: totalStagesInt,
        completed: completedBool,
        testScore: testScoreInt
      });
      
      if (isNaN(userIdInt) || isNaN(currentStageInt) || isNaN(totalStagesInt)) {
        throw new Error('参数类型错误：userId, currentStage, totalStages 必须是数字');
      }

      // 🔧 只有在学习完成且测试分数大于等于80时才保存进度
      if (!completedBool || !testScoreInt || testScoreInt < 80) {
        console.log('⚠️ 未达到保存条件 - 必须完成学习且测试分数≥80');
        return null;
      }
      
      const existing = db.prepare('SELECT id FROM learning_progress WHERE user_id = ? AND file_id = ?').get(userIdInt, fileId);
      
      if (existing) {
        return db.prepare(`
          UPDATE learning_progress 
          SET current_stage = ?, total_stages = ?, completed = ?, test_score = ?, learning_type = 'file', updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND file_id = ?
        `).run(currentStageInt, totalStagesInt, 1, testScoreInt, userIdInt, fileId);
      } else {
        return db.prepare(`
          INSERT INTO learning_progress (user_id, file_id, current_stage, total_stages, completed, test_score, learning_type)
          VALUES (?, ?, ?, ?, ?, ?, 'file')
        `).run(userIdInt, fileId, currentStageInt, totalStagesInt, 1, testScoreInt);
      }
    } catch (error) {
      console.error('保存文件学习进度失败:', error);
      throw error;
    }
  },

  // 🔧 新增：获取用户的文件学习进度
  getFileProgress: (userId, fileId) => {
    try {
      const userIdInt = parseInt(userId);
      
      if (isNaN(userIdInt)) {
        throw new Error('参数类型错误：userId 必须是数字');
      }
      
      return db.prepare('SELECT * FROM learning_progress WHERE user_id = ? AND file_id = ? AND learning_type = "file"').get(userIdInt, fileId);
    } catch (error) {
      console.error('获取文件学习进度失败:', error);
      throw error;
    }
  },

  // 🔧 新增：检查用户是否可以学习指定文件（按标签顺序）
  canUserLearnFile: (userId, fileId) => {
    try {
      const userIdInt = parseInt(userId);
      
      if (isNaN(userIdInt)) {
        throw new Error('参数类型错误：userId 必须是数字');
      }

      // 获取文件所属的标签
      const fileTagQuery = db.prepare(`
        SELECT ft.tag_id, tfo.order_index 
        FROM file_tags ft
        JOIN tag_file_order tfo ON ft.file_id = tfo.file_id AND ft.tag_id = tfo.tag_id
        WHERE ft.file_id = ?
        ORDER BY tfo.order_index ASC
        LIMIT 1
      `);
      
      const fileTag = fileTagQuery.get(fileId);
      if (!fileTag) {
        console.log('⚠️ 文件未关联任何标签，允许学习');
        return true;
      }

      // 获取同一标签下所有文件的顺序
      const tagFiles = db.prepare(`
        SELECT tfo.file_id, tfo.order_index
        FROM tag_file_order tfo
        WHERE tfo.tag_id = ?
        ORDER BY tfo.order_index ASC
      `).all(fileTag.tag_id);

      // 找到当前文件在序列中的位置
      const currentFileIndex = tagFiles.findIndex(f => f.file_id === fileId);
      if (currentFileIndex === -1) {
        console.log('⚠️ 文件不在标签序列中，允许学习');
        return true;
      }

      // 如果是第一个文件，直接允许学习
      if (currentFileIndex === 0) {
        console.log('✅ 第一个文件，允许学习');
        return true;
      }

      // 检查前一个文件是否已完成学习（测试分数≥80）
      const previousFile = tagFiles[currentFileIndex - 1];
      const previousProgress = db.prepare(`
        SELECT * FROM learning_progress 
        WHERE user_id = ? AND file_id = ? AND learning_type = 'file' AND completed = 1 AND test_score >= 80
      `).get(userIdInt, previousFile.file_id);

      if (previousProgress) {
        console.log('✅ 前置文件已完成，允许学习');
        return true;
      } else {
        console.log('❌ 前置文件未完成，不允许学习');
        return false;
      }
    } catch (error) {
      console.error('检查学习权限失败:', error);
      return false;
    }
  }
};

// 文件可见性相关的数据库操作
const fileVisibilityOperations = {
  // 获取某用户可见的所有文件ID
  getVisibleFileIdsForUser: (userId) => {
    try {
      const rows = db.prepare('SELECT file_id FROM file_user_visibility WHERE user_id = ?').all(userId);
      return rows.map(r => r.file_id);
    } catch (error) {
      console.error('获取用户可见文件失败:', error);
      return [];
    }
  },
  // 获取某文件可见的所有用户ID
  getVisibleUserIdsForFile: (fileId) => {
    try {
      const rows = db.prepare('SELECT user_id FROM file_user_visibility WHERE file_id = ?').all(fileId);
      return rows.map(r => r.user_id);
    } catch (error) {
      console.error('获取文件可见用户失败:', error);
      return [];
    }
  },
  // 设置某文件可见用户（覆盖式）
  setFileVisibleUsers: (fileId, userIds) => {
    try {
      db.prepare('DELETE FROM file_user_visibility WHERE file_id = ?').run(fileId);
      const stmt = db.prepare('INSERT INTO file_user_visibility (file_id, user_id) VALUES (?, ?)');
      for (const userId of userIds) {
        stmt.run(fileId, userId);
      }
      return true;
    } catch (error) {
      console.error('设置文件可见用户失败:', error);
      return false;
    }
  }
};

// 标签下文件排序相关数据库操作
const tagFileOrderOperations = {
  // 获取某标签下所有文件及顺序
  getFilesByTagOrdered: (tagId) => {
    try {
      return db.prepare(`
        SELECT f.*, tfo.order_index FROM uploaded_files f
        JOIN tag_file_order tfo ON f.id = tfo.file_id
        WHERE tfo.tag_id = ?
        ORDER BY tfo.order_index ASC
      `).all(tagId);
    } catch (error) {
      console.error('获取标签下文件排序失败:', error);
      return [];
    }
  },
  // 设置某标签下文件顺序（全量覆盖）
  setTagFileOrder: (tagId, fileIdOrderArr) => {
    try {
      db.prepare('DELETE FROM tag_file_order WHERE tag_id = ?').run(tagId);
      const stmt = db.prepare('INSERT INTO tag_file_order (tag_id, file_id, order_index) VALUES (?, ?, ?)');
      fileIdOrderArr.forEach((fileId, idx) => {
        stmt.run(tagId, fileId, idx);
      });
      return true;
    } catch (error) {
      console.error('设置标签文件顺序失败:', error);
      return false;
    }
  }
};

// 导出数据库操作函数
module.exports = {
  get: (sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt.get(params);
    } catch (error) {
      console.error('数据库查询失败:', error);
      throw error;
    }
  },
  
  all: (sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt.all(params);
    } catch (error) {
      console.error('数据库查询失败:', error);
      throw error;
    }
  },
  
  run: (sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt.run(params);
    } catch (error) {
      console.error('数据库执行失败:', error);
      throw error;
    }
  },
  
  close: () => {
    db.close();
  },

  // 🏷️ 新增：导出标签相关操作
  tags: tagOperations,
  // 🏷️ 新增：导出学习进度相关操作  
  learningProgress: learningProgressOperations,
  
  // 🔧 新增：导出兼容性函数（用于旧代码）
  saveTagProgress: learningProgressOperations.saveTagProgress,
  saveFileProgress: learningProgressOperations.saveFileProgress,
  getFileProgress: learningProgressOperations.getFileProgress,
  canUserLearnFile: learningProgressOperations.canUserLearnFile,

  // 🔧 新增：导出文件相关操作
  files: fileOperations,

  // 🔧 新增：导出辅助函数
  getRelativeTime: getRelativeTime,

  // 🏷️ 新增：导出原始数据库连接（供复杂查询使用）
  db: db,

  // 🔑 新增：导出文件可见性相关操作
  fileVisibility: fileVisibilityOperations,

  // 🔄 新增：导出标签下文件排序相关操作
  tagFileOrder: tagFileOrderOperations
};
