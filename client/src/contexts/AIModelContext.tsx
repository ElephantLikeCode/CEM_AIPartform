import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';

export type AIModel = 'local' | 'deepseek';

interface AIModelContextType {
  // AI总开关 - 控制所有AI功能
  isAIEnabled: boolean;
  setIsAIEnabled: (enabled: boolean) => void;
  
  // 模型选择
  currentModel: AIModel;
  setCurrentModel: (model: AIModel) => void;
  
  // DeepSeek可用性检查
  isDeepSeekAvailable: boolean;
  setIsDeepSeekAvailable: (available: boolean) => void;
  
  // 🔄 新增：同步状态相关
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncSettings: () => Promise<void>;
  
  // 🔄 新增：设置版本控制
  settingsVersion: number;
  checkForUpdates: () => Promise<boolean>;
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

export const useAIModel = () => {
  const context = useContext(AIModelContext);
  if (context === undefined) {
    throw new Error('useAIModel must be used within an AIModelProvider');
  }
  return context;
};

interface AIModelProviderProps {
  children: React.ReactNode;
}

export const AIModelProvider: React.FC<AIModelProviderProps> = ({ children }) => {
  // AI总开关状态
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  // 模型选择状态
  const [currentModel, setCurrentModel] = useState<AIModel>('local');
  // DeepSeek可用性检查
  const [isDeepSeekAvailable, setIsDeepSeekAvailable] = useState(false);
    // 🔄 新增：同步状态管理
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 🔄 新增：WebSocket集成
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'ai_settings_updated':
        console.log('🔄 收到AI设置更新通知:', message.data);
        if (message.data.settings) {
          setIsAIEnabled(message.data.settings.isAIEnabled);
          setCurrentModel(message.data.settings.currentModel);
          setSettingsVersion(message.data.version);
          setLastSyncTime(new Date());
          
          // 更新本地存储
          localStorage.setItem('ai-enabled', message.data.settings.isAIEnabled.toString());
          localStorage.setItem('ai-model-preference', message.data.settings.currentModel);
        }
        break;
      default:
        // 忽略其他消息类型
        break;
    }
  }, []);  // 🔄 WebSocket连接回调
  const handleWebSocketConnect = useCallback(() => {
    console.log('🔌 AI设置WebSocket连接已建立');
    // 连接后会在其他地方触发检查更新
  }, []);

  const handleWebSocketDisconnect = useCallback(() => {
    console.log('🔌 AI设置WebSocket连接已断开');
  }, []);

  // 🔄 初始化WebSocket连接
  const token = localStorage.getItem('authToken') || undefined; // 假设token存储在localStorage
  const webSocket = useWebSocket({
    token,
    onMessage: handleWebSocketMessage,
    onConnect: handleWebSocketConnect,
    onDisconnect: handleWebSocketDisconnect
  });
  
  // 🔄 同步设置到服务器
  const syncSettings = useCallback(async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      const response = await axios.post('/api/system/sync-ai-settings', {
        isAIEnabled,
        currentModel,
        version: settingsVersion,
        timestamp: new Date().toISOString()
      });
      
      if (response.data.success) {
        setLastSyncTime(new Date());
        console.log('✅ AI设置同步成功');
      }
    } catch (error) {
      console.error('❌ AI设置同步失败:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isAIEnabled, currentModel, settingsVersion, isSyncing]);
  
  // 🔄 检查设置更新
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    try {
      const response = await axios.get('/api/system/ai-settings-version');
      if (response.data.success) {
        const serverVersion = response.data.version;
        if (serverVersion > settingsVersion) {
          console.log('🔄 检测到AI设置更新，同步中...');
          
          // 更新本地设置
          setIsAIEnabled(response.data.settings.isAIEnabled);
          setCurrentModel(response.data.settings.currentModel);
          setSettingsVersion(serverVersion);
          setLastSyncTime(new Date());
          
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ 检查AI设置更新失败:', error);
      return false;
    }
  }, [settingsVersion]);  // 🔄 自动同步设置当状态变化时
  useEffect(() => {
    // 只有在初始化完成后，且有过同步记录时才自动同步
    if (isInitialized && lastSyncTime) {
      const timeoutId = setTimeout(() => {
        syncSettings();
      }, 1000); // 1秒延迟避免频繁同步
      
      return () => clearTimeout(timeoutId);
    }
  }, [isAIEnabled, currentModel]); // 移除syncSettings依赖，避免循环  // 在组件加载时从后端获取设置，优先于localStorage
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        // 🔒 首先检查用户是否已登录
        console.log('🔄 检查用户登录状态...');
        const authResponse = await axios.get('/api/auth/check-login');
        
        if (authResponse.data.success && authResponse.data.isLoggedIn) {
          // 用户已登录，从后端获取AI设置
          console.log('🔄 用户已登录，从后端获取AI设置...');
          const response = await axios.get('/api/system/ai-settings-version');
          if (response.data.success && response.data.settings) {
            console.log('📥 从后端获取到AI设置:', response.data.settings);
            // 优先使用后端设置
            setIsAIEnabled(response.data.settings.isAIEnabled);
            setCurrentModel(response.data.settings.currentModel);
            setSettingsVersion(response.data.version);
            setLastSyncTime(new Date());
            
            // 更新本地存储
            localStorage.setItem('ai-enabled', response.data.settings.isAIEnabled.toString());
            localStorage.setItem('ai-model-preference', response.data.settings.currentModel);
            
            console.log('✅ AI设置已从后端同步，当前模型:', response.data.settings.currentModel);
          } else {
            // 如果后端没有返回设置，则从localStorage恢复
            console.log('⚠️ 后端未返回AI设置，从本地存储恢复');
            restoreFromLocalStorage();
          }
        } else {
          // 用户未登录，直接从localStorage恢复设置
          console.log('ℹ️ 用户未登录，从本地存储恢复AI设置');
          restoreFromLocalStorage();
        }
      } catch (error) {
        // 发生错误时从localStorage恢复（包括401认证错误）
        console.log('⚠️ 获取AI设置时发生错误，从本地存储恢复:', error.response?.status === 401 ? '用户未认证' : error.message);
        restoreFromLocalStorage();
      }
      
      // 标记初始化完成
      setIsInitialized(true);
    };
    
    const restoreFromLocalStorage = () => {
      // 恢复AI总开关设置
      const savedAIEnabled = localStorage.getItem('ai-enabled');
      if (savedAIEnabled !== null) {
        setIsAIEnabled(savedAIEnabled === 'true');
      }

      // 恢复模型选择设置
      const savedModel = localStorage.getItem('ai-model-preference');
      if (savedModel === 'local' || savedModel === 'deepseek') {
        setCurrentModel(savedModel);
      }
    };
    
    initializeSettings();
  }, []);// 保存AI总开关设置
  const handleAIEnabledChange = async (enabled: boolean) => {
    setIsAIEnabled(enabled);
    localStorage.setItem('ai-enabled', enabled.toString());
    
    // 同步到后端
    try {
      await axios.post('/api/system/sync-ai-settings', {
        isAIEnabled: enabled,
        currentModel: currentModel,
        reason: 'AI开关变更'
      });
    } catch (error) {
      console.error('同步AI设置到后端失败:', error);
    }
  };

  // 保存模型选择设置
  const handleModelChange = async (model: AIModel) => {
    setCurrentModel(model);
    localStorage.setItem('ai-model-preference', model);
    
    // 同步到后端
    try {
      await axios.post('/api/system/sync-ai-settings', {
        isAIEnabled: isAIEnabled,
        currentModel: model,
        reason: 'AI模型变更'
      });
    } catch (error) {
      console.error('同步AI设置到后端失败:', error);
    }
  };

  return (
    <AIModelContext.Provider
      value={{
        // AI总开关
        isAIEnabled,
        setIsAIEnabled: handleAIEnabledChange,
        
        // 模型选择
        currentModel,
        setCurrentModel: handleModelChange,
          // DeepSeek可用性
        isDeepSeekAvailable,
        setIsDeepSeekAvailable,
        
        // 🔄 同步状态
        isSyncing,
        lastSyncTime,
        syncSettings,
        settingsVersion,
        checkForUpdates
      }}
    >
      {children}
    </AIModelContext.Provider>
  );
};
