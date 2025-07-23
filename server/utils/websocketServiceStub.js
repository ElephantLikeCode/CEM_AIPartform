/**
 * WebSocket服务桩 - 临时替代实现
 * 避免循环依赖问题
 */

const beijingTime = require('./beijingTime'); // 🕐 北京时间工具

// 创建一个简单的桩实现
const webSocketServiceStub = {
  // 学习进度通知
  notifyLearningProgress: (userId, data) => {
    console.log(`📬 [WebSocket桩] 学习进度通知 - 用户${userId}:`, data.type);
  },

  // 测验状态通知
  notifyQuizStatus: (userId, data) => {
    console.log(`📬 [WebSocket桩] 测验状态通知 - 用户${userId}:`, data.type);
  },

  // 文件操作通知
  notifyFileOperation: (userId, operation, fileInfo) => {
    console.log(`📬 [WebSocket桩] 文件操作通知 - 用户${userId}: ${operation}`, fileInfo.name);
  },

  // AI设置更新通知
  notifyAISettingsUpdate: (adminUserId, settings) => {
    console.log(`📬 [WebSocket桩] AI设置更新通知 - 管理员${adminUserId}`);
  },

  // 会话冲突通知
  notifySessionConflict: (userId, conflictInfo) => {
    console.log(`📬 [WebSocket桩] 会话冲突通知 - 用户${userId}`);
  },

  // 系统维护通知
  notifySystemMaintenance: (message, maintenanceInfo) => {
    console.log(`📬 [WebSocket桩] 系统维护通知:`, message);
  },

  // 初始化方法（空实现）
  initialize: (server) => {
    console.log(`🔌 [WebSocket桩] 服务已初始化（桩模式）`);
  },

  // 状态查询方法
  getOnlineUsers: () => [],
  getRoomInfo: (roomId) => ({ roomId, users: [], userCount: 0 }),
  getUserConnectionStatus: (userId) => ({ userId, isOnline: false, connectionCount: 0 }),
  getServiceStatus: () => ({ 
    totalConnections: 0, 
    uniqueUsers: 0, 
    totalRooms: 0, 
    uptime: process.uptime(),
    timestamp: beijingTime.toBeijingISOString(),
    mode: 'stub'
  })
};

module.exports = webSocketServiceStub;
