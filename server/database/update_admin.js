const Database = require('better-sqlite3');
const path = require('path');

// 连接到数据库
const dbPath = path.join(__dirname, 'knowledge_platform.db');
const db = new Database(dbPath);

try {
  // 更新指定用户为管理员
  const email = 'DC22956@umac.mo';
  
  // 首先检查用户是否存在
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) {
    console.log(`❌ 用户 ${email} 不存在`);
    process.exit(1);
  }
  
  console.log('📋 当前用户信息:');
  console.log(`   ID: ${user.id}`);
  console.log(`   邮箱: ${user.email}`);
  console.log(`   当前角色: ${user.role || 'user'}`);
  console.log(`   创建时间: ${user.created_at}`);
  
  // 更新用户角色为管理员
  const updateResult = db.prepare('UPDATE users SET role = ? WHERE email = ?').run('admin', email);
  
  if (updateResult.changes > 0) {
    console.log(`✅ 成功将 ${email} 更新为管理员账户`);
    
    // 验证更新结果
    const updatedUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    console.log('📋 更新后用户信息:');
    console.log(`   ID: ${updatedUser.id}`);
    console.log(`   邮箱: ${updatedUser.email}`);
    console.log(`   新角色: ${updatedUser.role}`);
    console.log(`   创建时间: ${updatedUser.created_at}`);
  } else {
    console.log(`❌ 更新失败，没有找到用户 ${email}`);
  }
  
} catch (error) {
  console.error('❌ 更新过程中出错:', error);
} finally {
  // 关闭数据库连接
  db.close();
  console.log('💾 数据库连接已关闭');
}
