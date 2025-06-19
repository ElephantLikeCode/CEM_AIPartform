const express = require('express');
const router = express.Router();
const db = require('../database/database');
const crypto = require('crypto');

// 获取所有用户列表
router.get('/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, email, username, role, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      data: users
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
router.delete('/users/:id', async (req, res) => {
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
router.put('/users/:id/password', async (req, res) => {
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
router.put('/users/:id/role', async (req, res) => {
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

module.exports = router;
