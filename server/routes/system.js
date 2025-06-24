const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const webSocketService = require('../utils/websocketServiceStub'); // 🔄 临时：WebSocket桩服务

// 系统状态监控 - 需要管理员权限
router.get('/status', requireAdmin, async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      },
      database: {
        status: 'connected',
        location: path.join(__dirname, '../database/knowledge_platform.db')
      },
      ai: {
        status: 'unknown',
        model: 'checking...'
      },
      files: {
        uploadsDir: path.join(__dirname, '../uploads'),
        totalFiles: 0,
        totalSize: 0
      }
    };

    // 检查AI服务状态
    try {
      const aiService = require('../utils/aiService');
      const aiAvailable = await aiService.checkModelAvailability();
      status.ai.status = aiAvailable ? 'available' : 'unavailable';
      status.ai.model = aiService.model || 'unknown';
    } catch (error) {
      status.ai.status = 'error';
      status.ai.error = error.message;
    }

    // 检查文件系统状态
    try {
      const uploadsPath = status.files.uploadsDir;
      if (fs.existsSync(uploadsPath)) {
        const files = fs.readdirSync(uploadsPath, { withFileTypes: true });
        const fileStats = files
          .filter(file => file.isFile())
          .map(file => {
            const filePath = path.join(uploadsPath, file.name);
            const stats = fs.statSync(filePath);
            return {
              name: file.name,
              size: stats.size,
              modified: stats.mtime
            };
          });
        
        status.files.totalFiles = fileStats.length;
        status.files.totalSize = fileStats.reduce((total, file) => total + file.size, 0);
        status.files.files = fileStats.slice(0, 10); // 最近10个文件
      }
    } catch (error) {
      status.files.error = error.message;
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统状态失败',
      error: error.message
    });
  }
});

// 系统健康检查 - 公开接口
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks: {
        server: 'pass',
        database: 'pass',
        ai: 'checking'
      }
    };

    // 快速AI检查
    try {
      const aiService = require('../utils/aiService');
      // 设置5秒超时
      const checkPromise = aiService.checkModelAvailability();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 5000)
      );
      
      const aiResult = await Promise.race([checkPromise, timeoutPromise]);
      health.checks.ai = aiResult ? 'pass' : 'fail';
    } catch (error) {
      health.checks.ai = 'fail';
    }

    // 如果有任何检查失败，整体状态为degraded
    const hasFailure = Object.values(health.checks).includes('fail');
    if (hasFailure) {
      health.status = 'degraded';
    }

    res.json(health);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 🔒 新增：AI设置版本管理
let aiSettingsVersion = 1;
let aiSettingsHistory = [];
let lastAISettingsUpdate = Date.now();

// 🤖 当前AI设置 - 导出给其他模块使用
let currentAISettings = {
  isAIEnabled: true,
  currentModel: 'local' // 默认使用本地模型
};

// 🔧 新增：将AI设置设为全局变量，供其他模块实时获取
global.currentAISettings = currentAISettings;

// 🔧 新增：提供获取当前AI设置的函数
const getCurrentAISettings = () => {
  return { ...currentAISettings };
};

// 🔒 修复：获取AI设置版本API - 根据用户权限返回不同设置
router.get('/ai-settings-version', requireAuth, (req, res) => {
  try {
    const userRole = req.user.role;
    const isAdmin = userRole === 'admin' || userRole === 'sub_admin';
    
    // 🔒 权限控制：普通用户只能使用本地模型
    let userAISettings = currentAISettings;
    if (!isAdmin) {
      userAISettings = {
        isAIEnabled: currentAISettings.isAIEnabled,
        currentModel: 'local' // 普通用户强制使用本地模型
      };
    }
    
    // 🔧 检查是否有强制更新标志
    const hasForceUpdate = global.aiSettingsForceUpdate === true;
    if (hasForceUpdate) {
      // 清除标志，避免重复提示
      global.aiSettingsForceUpdate = false;
      console.log(`🔄 检测到AI设置强制更新请求 - 用户${req.user.id}(${userRole})`);
    }
    
    const response = {
      success: true,
      version: aiSettingsVersion,
      settings: userAISettings,
      lastUpdate: new Date(lastAISettingsUpdate).toISOString(),
      timestamp: new Date().toISOString(),
      userRole: userRole,
      hasDeepSeekAccess: isAdmin,
      isDeepSeekAvailable: isAdmin && currentAISettings.currentModel === 'deepseek',
      forceUpdate: hasForceUpdate, // 🔧 新增：强制更新标志
      debug: {
        requestTime: new Date().toISOString(),
        settingsVersion: aiSettingsVersion,
        userPermissions: {
          canUseDeepSeek: isAdmin,
          enforceLocalModel: !isAdmin
        }
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('获取AI设置版本失败:', error);
    res.status(500).json({
      success: false,
      message: '获取AI设置版本失败',
      error: error.message
    });
  }
});

// 🔒 新增：同步AI设置API
router.post('/sync-ai-settings', requireAdmin, (req, res) => {
  try {
    const { isAIEnabled, currentModel, reason } = req.body;
    
    if (isAIEnabled === undefined || !currentModel) {
      return res.status(400).json({
        success: false,
        message: '缺少AI设置参数'
      });
    }    // 更新当前设置
    const oldSettings = { ...currentAISettings };
    currentAISettings = {
      isAIEnabled,
      currentModel
    };
    
    // 🔧 同步更新全局变量
    global.currentAISettings = currentAISettings;
    
    // 增加版本号
    aiSettingsVersion++;
    lastAISettingsUpdate = Date.now();
    
    // 🔧 新增：强制版本更新，确保所有客户端都能感知到变化
    const versionIncrement = Math.floor(Math.random() * 10) + 1; // 随机增量1-10
    aiSettingsVersion += versionIncrement;
    
    // 🔧 新增：详细日志，确保变更过程可追踪
    console.log(`🔄 AI设置已更新:`, {
      前设置: oldSettings,
      新设置: currentAISettings,
      版本: `${aiSettingsVersion - versionIncrement} -> ${aiSettingsVersion}`,
      管理员: req.user?.id || 'unknown',
      原因: reason || '管理员更新',
      时间戳: new Date(lastAISettingsUpdate).toISOString(),
      全局变量状态: global.currentAISettings,
      全局变量地址: global.currentAISettings === currentAISettings ? '✅ 已同步' : '❌ 不一致'
    });
    
    // 🔧 新增：验证全局变量是否正确更新
    if (global.currentAISettings.currentModel !== currentAISettings.currentModel || 
        global.currentAISettings.isAIEnabled !== currentAISettings.isAIEnabled) {
      console.error('❌ 全局AI设置变量更新失败!', {
        期望: currentAISettings,
        实际: global.currentAISettings
      });
      // 强制重新设置
      global.currentAISettings = { ...currentAISettings };
    }
    
    // 记录设置历史
    aiSettingsHistory.push({
      version: aiSettingsVersion,
      settings: { ...currentAISettings },
      oldSettings: oldSettings,
      reason: reason || '管理员更新',
      timestamp: lastAISettingsUpdate,
      adminId: req.user?.id || 'unknown',
      userRole: req.user?.role || 'unknown'
    });
      // 保持历史记录不超过50条
    if (aiSettingsHistory.length > 50) {
      aiSettingsHistory = aiSettingsHistory.slice(-50);
    }
    
    // 🔄 增强：发送WebSocket通知和强制同步通知
    try {
      const notificationData = {
        version: aiSettingsVersion,
        settings: currentAISettings,
        reason: reason || '管理员更新',
        timestamp: new Date(lastAISettingsUpdate).toISOString(),
        adminId: req.user?.id || 'unknown',
        urgent: true // 标记为紧急更新
      };
      
      // WebSocket通知（如果可用）
      webSocketService.notifyAISettingsUpdate(req.user?.id || 'unknown', notificationData);
      
      // 🔧 新增：设置全局标志，让下次API调用强制返回更新
      global.aiSettingsForceUpdate = true;
      
      console.log(`✅ AI设置更新通知已发送 - 版本 ${aiSettingsVersion}`);
    } catch (wsError) {
      console.warn('❌ WebSocket通知发送失败:', wsError.message);
    }
    
    res.json({
      success: true,
      version: aiSettingsVersion,
      settings: currentAISettings,
      message: 'AI设置同步成功',
      timestamp: new Date(lastAISettingsUpdate).toISOString()
    });
    
  } catch (error) {
    console.error('同步AI设置失败:', error);
    res.status(500).json({
      success: false,
      message: '同步AI设置失败',
      error: error.message
    });
  }
});

// 🔒 新增：获取AI设置历史API
router.get('/ai-settings-history', requireAdmin, (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit), 50);
    
    const history = aiSettingsHistory
      .slice(-limitNum)
      .reverse()
      .map(record => ({
        version: record.version,
        reason: record.reason,
        timestamp: new Date(record.timestamp).toISOString(),
        adminId: record.adminId
      }));
    
    res.json({
      success: true,
      history,
      currentVersion: aiSettingsVersion,
      totalRecords: aiSettingsHistory.length
    });
    
  } catch (error) {
    console.error('获取AI设置历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取AI设置历史失败',
      error: error.message
    });
  }
});

module.exports = router;

// 🔧 新增：导出AI设置获取函数供其他模块使用
module.exports.getCurrentAISettings = getCurrentAISettings;
