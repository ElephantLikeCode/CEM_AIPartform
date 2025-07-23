const db = require('../database/database');
const beijingTime = require('../utils/beijingTime'); // 🕐 引入北京时间工具

// 登录验证中间件
const requireAuth = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '请先登录',
        code: 'NOT_AUTHENTICATED'
      });
    }
    
    // 获取用户信息并设置到 req.user
    const user = await db.get('SELECT id, username, email, role FROM users WHERE id = ?', [req.session.userId]);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('身份验证失败:', error);
    res.status(500).json({
      success: false,
      message: '身份验证失败'
    });
  }
};

// 管理员权限验证中间件（包含二级管理员）
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '请先登录',
        code: 'NOT_AUTHENTICATED'
      });
    }    const user = await db.get('SELECT id, username, email, role FROM users WHERE id = ?', [req.session.userId]);
    
    if (!user || !['admin', 'sub_admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: '权限不足，需要管理员权限',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    req.user = user;
    req.session.userRole = user.role; // 更新session中的角色信息
    next();
  } catch (error) {
    console.error('权限验证失败:', error);
    res.status(500).json({
      success: false,
      message: '权限验证失败'
    });
  }
};

// 超级管理员权限验证中间件
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '请先登录',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const user = await db.get('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，需要超级管理员权限',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('权限验证失败:', error);
    res.status(500).json({
      success: false,
      message: '权限验证失败'
    });
  }
};

// 角色验证中间件
const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          success: false,
          message: '请先登录',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const user = await db.get('SELECT id, email, role FROM users WHERE id = ?', [req.session.userId]);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: '用户不存在',
          code: 'USER_NOT_FOUND'
        });
      }

      const userRole = user.role || 'user';
      if (roles && !roles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: '权限不足',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('权限验证失败:', error);
      res.status(500).json({
        success: false,
        message: '权限验证失败'
      });
    }
  };
};

// 获取当前用户信息的中间件
const getCurrentUser = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await db.get('SELECT id, email, username, role, created_at FROM users WHERE id = ?', [req.session.userId]);
      
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role || 'user',
          createdAt: beijingTime.formatToChinese(user.created_at) // 🕐 转换为北京时间
        };
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  }
  next();
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireRole,
  getCurrentUser
};
