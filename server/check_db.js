const Database = require('better-sqlite3');
const db = new Database('database/knowledge_platform.db');

console.log('=== 用户信息查询 ===');
const users = db.prepare('SELECT id, email, role, password_hash FROM users').all();
users.forEach(user => {
  console.log(`用户${user.id}: ${user.email} (${user.role})`);
  console.log(`  密码哈希: ${user.password_hash.substring(0, 20)}...`);
});

db.close();
