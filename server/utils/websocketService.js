/**
 * WebSocket服务 - 实时通知系统
 * 支持多用户并发、AI模型设置同步、文件操作通知等
 */

const WebSocket = require('ws');
const beijingTime = require('./beijingTime'); // 🕐 北京时间工具
const jwt = require('jsonwebtoken');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.rooms = new Map(); // roomId -> Set of userIds
    this.userSessions = new Map(); // userId -> sessionInfo
  }

  /**
   * 初始化WebSocket服务器
   */
  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    console.log('🔌 WebSocket服务已启动');
  }

  /**
   * 验证客户端连接
   */
  verifyClient(info) {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.warn('❌ WebSocket连接被拒绝：缺少token');
        return false;
      }

      // 简化验证：解析用户ID
      if (token.startsWith('user_')) {
        const userId = token.replace('user_', '');
        if (userId && !isNaN(parseInt(userId))) {
          info.req.user = { userId: parseInt(userId) };
          return true;
        }
      }

      console.warn('❌ WebSocket连接被拒绝：token格式无效');
      return false;
    } catch (error) {
      console.warn('❌ WebSocket连接被拒绝：验证失败', error.message);
      return false;
    }
  }

  /**
   * 处理WebSocket连接
   */
  handleConnection(ws, req) {
    const user = req.user;
    const userId = user.userId;

    console.log(`🔌 用户 ${userId} 建立WebSocket连接`);

    // 注册客户端
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);

    // 发送连接成功消息
    this.sendToUser(userId, {
      type: 'connected',
      data: {
        message: '连接成功',
        userId: userId,
        timestamp: beijingTime.toBeijingISOString()
      }
    });

    // 处理消息
    ws.on('message', (message) => {
      this.handleMessage(ws, userId, message);
    });

    // 处理断开连接
    ws.on('close', () => {
      this.handleDisconnection(userId, ws);
    });

    // 处理错误
    ws.on('error', (error) => {
      console.error(`❌ WebSocket错误 (用户 ${userId}):`, error);
    });

    // 发送用户当前状态
    this.sendUserStatus(userId);
  }

  /**
   * 处理客户端消息
   */
  handleMessage(ws, userId, message) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join_room':
          this.joinRoom(userId, data.roomId);
          break;
        case 'leave_room':
          this.leaveRoom(userId, data.roomId);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: beijingTime.toBeijingISOString() }));
          break;
        case 'session_update':
          this.handleSessionUpdate(userId, data.sessionData);
          break;
        default:
          console.warn(`⚠️ 未知消息类型: ${data.type}`);
      }
    } catch (error) {
      console.error('❌ 处理WebSocket消息失败:', error);
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnection(userId, ws) {
    console.log(`🔌 用户 ${userId} 断开WebSocket连接`);
    
    if (this.clients.has(userId)) {
      this.clients.get(userId).delete(ws);
      if (this.clients.get(userId).size === 0) {
        this.clients.delete(userId);
        console.log(`🔌 用户 ${userId} 所有连接已断开`);
      }
    }

    // 从所有房间中移除用户
    this.rooms.forEach((users, roomId) => {
      if (users.has(userId)) {
        this.leaveRoom(userId, roomId);
      }
    });
  }

  /**
   * 发送消息给指定用户
   */
  sendToUser(userId, message) {
    const userConnections = this.clients.get(userId);
    if (userConnections) {
      const messageStr = JSON.stringify(message);
      userConnections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      });
      return true;
    }
    return false;
  }

  /**
   * 发送消息给房间内所有用户
   */
  sendToRoom(roomId, message, excludeUserId = null) {
    const roomUsers = this.rooms.get(roomId);
    if (roomUsers) {
      roomUsers.forEach(userId => {
        if (userId !== excludeUserId) {
          this.sendToUser(userId, message);
        }
      });
    }
  }

  /**
   * 广播消息给所有在线用户
   */
  broadcast(message) {
    this.clients.forEach((connections, userId) => {
      this.sendToUser(userId, message);
    });
  }

  /**
   * 加入房间
   */
  joinRoom(userId, roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(userId);
    
    console.log(`🏠 用户 ${userId} 加入房间 ${roomId}`);
    
    // 通知房间内其他用户
    this.sendToRoom(roomId, {
      type: 'user_joined',
      data: {
        userId: userId,
        roomId: roomId,
        timestamp: beijingTime.toBeijingISOString()
      }
    }, userId);
  }

  /**
   * 离开房间
   */
  leaveRoom(userId, roomId) {
    if (this.rooms.has(roomId)) {
      this.rooms.get(roomId).delete(userId);
      
      // 如果房间为空，删除房间
      if (this.rooms.get(roomId).size === 0) {
        this.rooms.delete(roomId);
      }
      
      console.log(`🏠 用户 ${userId} 离开房间 ${roomId}`);
      
      // 通知房间内其他用户
      this.sendToRoom(roomId, {
        type: 'user_left',
        data: {
          userId: userId,
          roomId: roomId,
          timestamp: beijingTime.toBeijingISOString()
        }
      }, userId);
    }
  }

  /**
   * 处理会话更新
   */
  handleSessionUpdate(userId, sessionData) {
    this.userSessions.set(userId, {
      ...sessionData,
      lastUpdate: beijingTime.toBeijingISOString()
    });
  }

  /**
   * 发送用户状态
   */
  sendUserStatus(userId) {
    const sessionData = this.userSessions.get(userId);
    this.sendToUser(userId, {
      type: 'user_status',
      data: {
        userId: userId,
        session: sessionData,
        onlineUsers: Array.from(this.clients.keys()),
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  // ==================== 业务通知方法 ====================

  /**
   * AI模型设置更新通知
   */
  notifyAISettingsUpdate(adminUserId, settings) {
    this.broadcast({
      type: 'ai_settings_updated',
      data: {
        updatedBy: adminUserId,
        settings: settings,
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  /**
   * 文件操作通知
   */
  notifyFileOperation(userId, operation, fileInfo) {
    this.broadcast({
      type: 'file_operation',
      data: {
        userId: userId,
        operation: operation, // 'upload', 'delete', 'lock', 'unlock'
        file: fileInfo,
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  /**
   * 会话冲突通知
   */
  notifySessionConflict(userId, conflictInfo) {
    this.sendToUser(userId, {
      type: 'session_conflict',
      data: {
        message: '检测到会话冲突',
        conflict: conflictInfo,
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  /**
   * 系统维护通知
   */
  notifySystemMaintenance(message, maintenanceInfo) {
    this.broadcast({
      type: 'system_maintenance',
      data: {
        message: message,
        maintenance: maintenanceInfo,
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  /**
   * 学习进度同步通知
   */
  notifyLearningProgress(userId, progressData) {
    // 通知用户的所有连接
    this.sendToUser(userId, {
      type: 'learning_progress',
      data: {
        progress: progressData,
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  /**
   * 测验状态同步通知
   */
  notifyQuizStatus(userId, quizData) {
    this.sendToUser(userId, {
      type: 'quiz_status',
      data: {
        quiz: quizData,
        timestamp: beijingTime.toBeijingISOString()
      }
    });
  }

  // ==================== 状态查询方法 ====================

  /**
   * 获取在线用户列表
   */
  getOnlineUsers() {
    return Array.from(this.clients.keys());
  }

  /**
   * 获取房间信息
   */
  getRoomInfo(roomId) {
    return {
      roomId: roomId,
      users: this.rooms.has(roomId) ? Array.from(this.rooms.get(roomId)) : [],
      userCount: this.rooms.has(roomId) ? this.rooms.get(roomId).size : 0
    };
  }

  /**
   * 获取用户连接状态
   */
  getUserConnectionStatus(userId) {
    return {
      userId: userId,
      isOnline: this.clients.has(userId),
      connectionCount: this.clients.has(userId) ? this.clients.get(userId).size : 0,
      session: this.userSessions.get(userId) || null
    };
  }

  /**
   * 获取服务状态
   */
  getServiceStatus() {
    return {
      totalConnections: Array.from(this.clients.values()).reduce((sum, connections) => sum + connections.size, 0),
      uniqueUsers: this.clients.size,
      totalRooms: this.rooms.size,
      uptime: process.uptime(),
      timestamp: beijingTime.toBeijingISOString()
    };
  }
}

// 创建单例实例
const webSocketService = new WebSocketService();

module.exports = webSocketService;
