const express = require('express');
const router = express.Router();
const db = require('../database/database');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../middleware/auth'); // 🔒 新增：权限验证
const beijingTime = require('../utils/beijingTime'); // 🕐 引入北京时间工具

// 获取所有用户列表
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, email, username, role, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    
    // 🕐 转换用户创建时间为北京时间
    const usersWithBeijingTime = users.map(user => ({
      ...user,
      created_at: beijingTime.formatToChinese(user.created_at) // 转换为中文格式的北京时间
    }));
    
    res.json({
      success: true,
      data: usersWithBeijingTime
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户列表失败'
    });
  }
});

// 删除用户
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const currentUserId = req.session.userId;
    const currentUserRole = req.session.userRole;

    // 不能删除自己
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: '不能删除自己的账户'
      });
    }

    // 获取要删除的用户信息
    const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 二级管理员不能删除管理员
    if (currentUserRole === 'sub_admin' && (targetUser.role === 'admin' || targetUser.role === 'sub_admin')) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法删除管理员账户'
      });
    }

    // 删除用户
    const result = await db.run('DELETE FROM users WHERE id = ?', [userId]);
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: '用户删除成功'
      });
    } else {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      success: false,
      message: '删除用户失败'
    });
  }
});

// 修改用户密码
router.put('/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { password } = req.body;
    const currentUserId = req.session.userId;
    const currentUserRole = req.session.userRole;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码至少6位'
      });
    }

    // 获取要修改的用户信息
    const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 二级管理员不能修改管理员密码
    if (currentUserRole === 'sub_admin' && (targetUser.role === 'admin' || targetUser.role === 'sub_admin')) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法修改管理员密码'
      });
    }

    // 加密新密码
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    
    // 更新密码
    const result = await db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: '密码修改成功'
      });
    } else {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      success: false,
      message: '修改密码失败'
    });
  }
});

// 修改用户角色
router.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    const currentUserId = req.session.userId;
    const currentUserRole = req.session.userRole;

    // 验证角色
    const validRoles = ['user', 'sub_admin', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: '无效的角色类型'
      });
    }

    // 不能修改自己的角色
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: '不能修改自己的角色'
      });
    }

    // 二级管理员不能设置管理员角色
    if (currentUserRole === 'sub_admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，二级管理员无法设置管理员角色'
      });
    }

    // 获取要修改的用户信息
    const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 更新角色
    const result = await db.run(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: '用户角色修改成功',
        data: {
          id: userId,
          role: role
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
  } catch (error) {
    console.error('修改用户角色失败:', error);
    res.status(500).json({
      success: false,
      message: '修改用户角色失败'
    });
  }
});

// 修改用户名
router.put('/users/:id/username', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { username } = req.body;
    const currentUserId = req.session.userId;
    const currentUserRole = req.session.userRole;

    // 验证用户名
    if (!username || username.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: '用户名至少2个字符'
      });
    }

    if (username.length > 50) {
      return res.status(400).json({
        success: false,
        message: '用户名不能超过50个字符'
      });
    }

    // 验证用户名格式
    const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: '用户名只能包含字母、数字、中文、下划线和横线'
      });
    }

    // 获取要修改的用户信息
    const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否有操作权限（与修改密码的权限检查一致）
    if (currentUserRole === 'sub_admin' && (targetUser.role === 'admin' || targetUser.role === 'sub_admin')) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法修改管理员用户名'
      });
    }

    // 检查用户名是否已存在（如果有其他用户使用了这个用户名）
    const existingUser = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username.trim(), userId]);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该用户名已被其他用户使用'
      });
    }

    // 更新用户名
    const result = await db.run(
      'UPDATE users SET username = ? WHERE id = ?',
      [username.trim(), userId]
    );
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: '用户名修改成功',
        data: {
          id: userId,
          username: username.trim()
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
  } catch (error) {
    console.error('修改用户名失败:', error);
    res.status(500).json({
      success: false,
      message: '修改用户名失败'
    });
  }
});

module.exports = router;
