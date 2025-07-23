#!/usr/bin/env node

/**
 * 数据库路径迁移脚本 v2.3.0
 * 将数据库中的绝对路径转换为相对路径，解决跨设备迁移问题
 */

const path = require('path');
const fs = require('fs-extra');
const Database = require('better-sqlite3');

console.log('🔄 开始数据库路径迁移...');

try {
  // 连接数据库
  const dbPath = path.join(__dirname, 'database', 'knowledge_platform.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ 数据库文件不存在:', dbPath);
    process.exit(1);
  }
  
  const db = new Database(dbPath);
  
  // 获取server目录的绝对路径
  const serverDir = __dirname;
  console.log('📁 Server目录:', serverDir);
  
  // 查询所有文件记录
  const files = db.prepare('SELECT id, upload_path FROM uploaded_files').all();
  console.log(`📊 找到 ${files.length} 个文件记录`);
  
  let migratedCount = 0;
  let alreadyRelativeCount = 0;
  
  const updateStmt = db.prepare('UPDATE uploaded_files SET upload_path = ? WHERE id = ?');
  
  // 开始事务
  const migrate = db.transaction(() => {
    for (const file of files) {
      const currentPath = file.upload_path;
      
      // 检查是否已经是相对路径
      if (!path.isAbsolute(currentPath)) {
        alreadyRelativeCount++;
        continue;
      }
      
      // 转换为相对路径
      try {
        const relativePath = path.relative(serverDir, currentPath);
        
        // 检查转换后的路径是否合理（应该以uploads开头）
        if (relativePath.startsWith('uploads')) {
          updateStmt.run(relativePath, file.id);
          migratedCount++;
          console.log(`✅ 迁移: ${file.id} -> ${relativePath}`);
        } else {
          console.warn(`⚠️ 跳过异常路径: ${file.id} -> ${currentPath}`);
        }
      } catch (error) {
        console.error(`❌ 处理文件 ${file.id} 失败:`, error.message);
      }
    }
  });
  
  migrate();
  
  // 关闭数据库
  db.close();
  
  console.log('\n📋 迁移结果:');
  console.log(`✅ 已迁移: ${migratedCount} 个文件`);
  console.log(`ℹ️ 已是相对路径: ${alreadyRelativeCount} 个文件`);
  console.log(`📊 总计: ${files.length} 个文件`);
  console.log('\n🎉 数据库路径迁移完成！');
  
  if (migratedCount > 0) {
    console.log('\n💡 建议:');
    console.log('1. 重启服务器以使更改生效');
    console.log('2. 验证文件上传和访问功能是否正常');
    console.log('3. 如有问题，请检查 uploads 目录中的文件是否完整');
  }
  
} catch (error) {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
}
