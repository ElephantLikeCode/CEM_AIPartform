const express = require('express');
const router = express.Router();
const db = require('../database/database');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const beijingTime = require('../utils/beijingTime'); // 🕐 引入北京时间工具

// 验证码存储（在生产环境中应使用 Redis 或数据库）
const verificationCodes = new Map();

// 更宽松的邮箱格式验证（支持更多格式）
const isValidEmail = (email) => {
  // 基本格式检查：必须包含@和.，且@前后都有内容
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // 更严格的格式检查
  const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // 先用基本检查，如果通过再用严格检查
  if (!basicRegex.test(email)) {
    return false;
  }
  
  // 检查是否只是纯数字或纯字母（不含@和.）
  const emailParts = email.split('@');
  if (emailParts.length !== 2) {
    return false;
  }
  
  const [localPart, domainPart] = emailParts;
  
  // 本地部分和域名部分都不能为空
  if (!localPart || !domainPart) {
    return false;
  }
  
  // 域名部分必须包含至少一个点
  if (!domainPart.includes('.')) {
    return false;
  }
  
  // 使用严格正则进行最终验证
  return strictRegex.test(email);
};

// 检查登录状态
router.get('/check-login', (req, res) => {
  const loggedIn = req.session && req.session.userId ? true : false;
  let userRole = null;
  
  if (loggedIn) {
    try {
      const user = db.get('SELECT role FROM users WHERE id = ?', [req.session.userId]);
      userRole = user ? user.role : 'user';
    } catch (error) {
      console.error('获取用户角色失败:', error);
      userRole = 'user';
    }
  }
  
  res.json({ 
    loggedIn,
    role: userRole
  });
});

// 登录
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // 基本验证
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: '邮箱和密码都不能为空' 
      });
    }

    // 验证邮箱格式
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: '邮箱格式不正确' 
      });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || user.password_hash !== crypto.createHash('sha256').update(password).digest('hex')) {
      return res.status(401).json({ success: false, message: '邮箱或密码错误' });
    }
    
    req.session.userId = user.id;
    req.session.userRole = user.role || 'user';
    
    res.json({ 
      success: true,
      message: '登录成功！',
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ success: false, message: '登录失败，请稍后重试' });
  }
});

// 注册
router.post('/register', async (req, res) => {
  const { email, password, code } = req.body;
  
  try {
    // 基本验证
    if (!email || !password || !code) {
      return res.status(400).json({ 
        success: false, 
        message: '邮箱、密码和验证码都不能为空' 
      });
    }

    // 验证邮箱格式
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: '邮箱格式不正确，请输入有效的邮箱地址' 
      });
    }

    // 验证密码长度
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: '密码至少需要6位' 
      });
    }

    // 验证验证码
    const storedCode = verificationCodes.get(email);
    if (!storedCode || storedCode !== code) {
      return res.status(400).json({ success: false, message: '验证码错误或已过期' });
    }
    
    const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ success: false, message: '邮箱已注册' });
    }
    
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    await db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);
    
    // 删除已使用的验证码
    verificationCodes.delete(email);
    
    res.json({ success: true, message: '注册成功！' });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ success: false, message: '注册失败，请稍后重试' });
  }
});

// 发送验证码
router.post('/send-code', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, message: '邮箱地址不能为空' });
  }

  // 验证邮箱格式
  if (!isValidEmail(email)) {
    return res.status(400).json({ 
      success: false, 
      message: '邮箱格式不正确，请输入有效的邮箱地址（如：example@domain.com）' 
    });
  }
  
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'elephant495532414@gmail.com',
        pass: 'chbantcdbmwrqckv'
      }
    });
    
    const mailOptions = {
      from: 'elephant495532414@gmail.com',
      to: email,
      subject: '澳電CEM AI學習平台 - 註冊驗證碼',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1890ff;">澳電CEM AI學習平台</h2>
          <p>您好！</p>
          <p>您正在註冊澳電CEM AI學習平台，您的驗證碼是：</p>
          <div style="background-color: #f0f8ff; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center;">
            <h1 style="color: #1890ff; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
          </div>
          <p>驗證碼將在10分鐘後過期，請儘快完成註冊。</p>
          <p>如果您沒有申請註冊，請忽略此郵件。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            此郵件由澳電CEM AI學習平台自動發送，請勿回复。
          </p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    // 存储验证码（10分钟后过期）
    verificationCodes.set(email, code);
    setTimeout(() => {
      verificationCodes.delete(email);
    }, 10 * 60 * 1000);
    
    console.log(`验证码已发送到邮箱: ${email}, 验证码: ${code}`);
    res.json({ success: true, message: '验证码已发送到您的邮箱' });
    
  } catch (error) {
    console.error('发送验证码失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '发送验证码失败，请检查邮箱地址是否正确' 
    });
  }
});

// 登出
router.post('/logout', (req, res) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('登出失败:', err);
          return res.status(500).json({ 
            success: false, 
            message: '登出失败' 
          });
        }
        
        // 清除cookie
        res.clearCookie('connect.sid');
        
        res.json({ 
          success: true, 
          message: '登出成功' 
        });
      });
    } else {
      res.json({ 
        success: true, 
        message: '已登出' 
      });
    }
  } catch (error) {
    console.error('登出错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '登出失败' 
    });
  }
});

// 获取当前用户信息
router.get('/user', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const userId = req.session.userId;
    const user = await db.get('SELECT id, email, username, role, created_at FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 🔍 新增：获取用户学习记录摘要
    const learningStats = await db.get(`
      SELECT 
        COUNT(*) as total_learning,
        COUNT(CASE WHEN completed = 1 THEN 1 END) as completed_learning,
        AVG(CASE WHEN test_score IS NOT NULL THEN test_score END) as avg_test_score
      FROM learning_progress 
      WHERE user_id = ?
    `, [userId]);

    // 获取最近的学习活动
    const recentActivity = await db.get(`
      SELECT updated_at as last_activity
      FROM learning_progress 
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `, [userId]);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role || 'user',
        createdAt: beijingTime.formatToChinese(user.created_at), // 🕐 转换为北京时间
        learningStats: {
          totalLearning: learningStats?.total_learning || 0,
          completedLearning: learningStats?.completed_learning || 0,
          learningCompletion: learningStats?.total_learning > 0 
            ? Math.round((learningStats.completed_learning / learningStats.total_learning) * 100) 
            : 0,
          avgTestScore: learningStats?.avg_test_score ? Math.round(learningStats.avg_test_score) : null,
          lastActivity: recentActivity?.last_activity 
            ? beijingTime.formatToChinese(recentActivity.last_activity)
            : null
        }
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
});

// 用户修改自己的密码
router.put('/update-password', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    // 验证参数
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请提供当前密码和新密码'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码至少6位'
      });
    }

    // 验证当前密码格式
    if (!/^[^\s]+$/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: '密码不能包含空格'
      });
    }

    // 获取用户当前密码hash
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 验证当前密码
    const currentPasswordHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    if (currentPasswordHash !== user.password_hash) {
      return res.status(400).json({
        success: false,
        message: '当前密码不正确'
      });
    }

    // 检查新密码是否与当前密码相同
    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    if (newPasswordHash === user.password_hash) {
      return res.status(400).json({
        success: false,
        message: '新密码不能与当前密码相同'
      });
    }

    // 更新密码
    const result = await db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
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

// 用户修改自己的用户名
router.put('/update-username', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const userId = req.session.userId;
    const { username } = req.body;

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