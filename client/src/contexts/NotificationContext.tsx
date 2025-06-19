/**
 * 通知上下文 - 全局WebSocket通知管理
 * 支持学习进度、测验状态、文件操作、AI设置等实时通知
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: any;
  actions?: NotificationAction[];
}

interface NotificationAction {
  label: string;
  onClick: () => void;
  type?: 'primary' | 'secondary';
}

interface NotificationContextType {
  // 通知列表
  notifications: Notification[];
  unreadCount: number;
  
  // 通知操作
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  
  // WebSocket状态
  isConnected: boolean;
  connectionError: string | null;
  
  // 业务通知处理
  onLearningProgress?: (data: any) => void;
  onQuizStatus?: (data: any) => void;
  onFileOperation?: (data: any) => void;
  onAISettingsUpdate?: (data: any) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
  userId?: string;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ 
  children, 
  userId 
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // 生成唯一ID
  const generateId = () => `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 添加通知
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: generateId(),
      timestamp: new Date(),
      read: false
    };
    
    setNotifications(prev => [newNotification, ...prev]);
    
    // 自动清理旧通知（保留最新50条）
    setTimeout(() => {
      setNotifications(prev => prev.slice(0, 50));
    }, 100);
  }, []);
  
  // 标记为已读
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, read: true }
          : notification
      )
    );
  }, []);
  
  // 标记所有为已读
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, read: true }))
    );
  }, []);
  
  // 移除通知
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);
  
  // 清空所有通知
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);
  
  // 计算未读数量
  const unreadCount = notifications.filter(n => !n.read).length;
  
  // WebSocket消息处理
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('📬 收到WebSocket通知:', message);
    
    switch (message.type) {
      case 'learning_progress':
        handleLearningProgressNotification(message.data);
        break;
      case 'quiz_status':
        handleQuizStatusNotification(message.data);
        break;
      case 'file_operation':
        handleFileOperationNotification(message.data);
        break;
      case 'ai_settings_updated':
        handleAISettingsNotification(message.data);
        break;
      case 'session_conflict':
        handleSessionConflictNotification(message.data);
        break;
      case 'system_maintenance':
        handleSystemMaintenanceNotification(message.data);
        break;
      default:
        console.log('🔔 未知通知类型:', message.type);
    }
  }, []);
  
  // 学习进度通知处理
  const handleLearningProgressNotification = (data: any) => {
    let title = '';
    let message = '';
    let type: 'info' | 'success' | 'warning' | 'error' = 'info';
    
    switch (data.type) {
      case 'learning_started':
        title = '学习开始';
        message = `开始学习标签"${data.tagName}"，共${data.totalStages}个阶段`;
        type = 'success';
        break;
      case 'file_learning_started':
        title = '文件学习开始';
        message = `开始学习文件"${data.fileName}"，共${data.totalStages}个阶段`;
        type = 'success';
        break;
      case 'progress_updated':
        title = '学习进度更新';
        message = `${data.learningType === 'tag' ? data.tagName : data.fileName} - 已完成第${data.newStage}阶段`;
        type = 'info';
        break;
      case 'learning_completed':
        title = '学习完成';
        message = `恭喜完成${data.learningType === 'tag' ? data.tagName : data.fileName}的学习！`;
        type = 'success';
        break;
      default:
        title = '学习通知';
        message = '学习状态已更新';
    }
    
    addNotification({
      type,
      title,
      message,
      data
    });
  };
  
  // 测验状态通知处理
  const handleQuizStatusNotification = (data: any) => {
    let title = '';
    let message = '';
    let type: 'info' | 'success' | 'warning' | 'error' = 'info';
    
    switch (data.type) {
      case 'quiz_generated':
        title = '测验生成成功';
        message = `${data.testType === 'tag_comprehensive' ? '标签' : '文件'}测验已生成，共${data.questionCount}道题目`;
        type = 'success';
        break;
      case 'quiz_completed':
        title = '测验完成';
        message = `${data.testTypeName}完成，得分：${data.finalScore}分，正确率：${data.accuracy}%`;
        type = data.accuracy >= 80 ? 'success' : 'warning';
        break;
      default:
        title = '测验通知';
        message = '测验状态已更新';
    }
    
    addNotification({
      type,
      title,
      message,
      data
    });
  };
  
  // 文件操作通知处理
  const handleFileOperationNotification = (data: any) => {
    let title = '';
    let message = '';
    let type: 'info' | 'success' | 'warning' | 'error' = 'info';
    
    switch (data.operation) {
      case 'upload':
        title = '文件上传';
        message = `文件"${data.file.name}"已上传`;
        type = 'success';
        break;
      case 'delete':
        title = '文件删除';
        message = `文件"${data.file.name}"已删除${data.file.forced ? '（强制删除）' : ''}`;
        type = 'warning';
        break;
      case 'lock':
        title = '文件锁定';
        message = `文件"${data.file.name}"已被锁定进行${data.file.operation}操作`;
        type = 'info';
        break;
      case 'unlock':
        title = '文件解锁';
        message = `文件"${data.file.name}"已解锁`;
        type = 'info';
        break;
      default:
        title = '文件操作';
        message = '文件状态已更新';
    }
    
    addNotification({
      type,
      title,
      message,
      data
    });
  };
  
  // AI设置通知处理
  const handleAISettingsNotification = (data: any) => {
    addNotification({
      type: 'info',
      title: 'AI设置更新',
      message: `管理员已更新AI设置 - ${data.reason}`,
      data
    });
  };
  
  // 会话冲突通知处理
  const handleSessionConflictNotification = (data: any) => {
    addNotification({
      type: 'warning',
      title: '会话冲突',
      message: data.message || '检测到会话冲突，请刷新页面',
      data,
      actions: [
        {
          label: '刷新页面',
          onClick: () => window.location.reload(),
          type: 'primary'
        }
      ]
    });
  };
  
  // 系统维护通知处理
  const handleSystemMaintenanceNotification = (data: any) => {
    addNotification({
      type: 'warning',
      title: '系统维护',
      message: data.message || '系统将进行维护',
      data
    });
  };
  
  // 获取认证token
  const token = userId ? localStorage.getItem('authToken') || undefined : undefined;
  
  // WebSocket连接
  const webSocket = useWebSocket({
    token,
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      console.log('🔌 通知WebSocket连接已建立');
      addNotification({
        type: 'success',
        title: '连接成功',
        message: '实时通知已启用'
      });
    },
    onDisconnect: () => {
      console.log('🔌 通知WebSocket连接已断开');
      addNotification({
        type: 'warning',
        title: '连接断开',
        message: '实时通知已禁用，正在尝试重连...'
      });
    },
    onError: (error) => {
      console.error('🔌 通知WebSocket连接错误:', error);
      addNotification({
        type: 'error',
        title: '连接错误',
        message: '实时通知连接失败'
      });
    }
  });
  
  // 清理过期通知
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前
      setNotifications(prev => 
        prev.filter(notification => notification.timestamp > cutoff)
      );
    }, 60 * 60 * 1000); // 每小时清理一次
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
        isConnected: webSocket.isConnected,
        connectionError: webSocket.error
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// 导出类型定义
export type { Notification, NotificationAction };
