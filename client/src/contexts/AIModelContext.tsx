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
  
  // 🔧 新增：强制同步方法
  forceSyncSettings: () => Promise<boolean>;
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
  }, []);// 🔄 WebSocket连接回调
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
        const serverSettings = response.data.settings;
        const forceUpdate = response.data.forceUpdate;
        
        console.log('🔍 AI设置检查结果:', {
          本地版本: settingsVersion,
          服务器版本: serverVersion,
          强制更新: forceUpdate,
          设置变化: JSON.stringify(serverSettings) !== JSON.stringify({
            isAIEnabled,
            currentModel
          })
        });
        
        // 🔧 增强条件：版本号变化或强制更新或设置内容变化
        const hasVersionUpdate = serverVersion > settingsVersion;
        const hasSettingsChange = JSON.stringify(serverSettings) !== JSON.stringify({
          isAIEnabled,
          currentModel
        });
        
        if (hasVersionUpdate || forceUpdate || hasSettingsChange) {
          console.log('🔄 检测到AI设置需要更新:', {
            原因: hasVersionUpdate ? '版本更新' : (forceUpdate ? '强制更新' : '设置变化'),
            新版本: serverVersion,
            新设置: serverSettings
          });
          
          // 更新本地设置
          setIsAIEnabled(serverSettings.isAIEnabled);
          setCurrentModel(serverSettings.currentModel);
          setIsDeepSeekAvailable(serverSettings.isDeepSeekAvailable ?? false);
          setSettingsVersion(serverVersion);
          setLastSyncTime(new Date());
          
          // 更新本地存储
          localStorage.setItem('ai-enabled', serverSettings.isAIEnabled.toString());
          localStorage.setItem('ai-model-preference', serverSettings.currentModel);
          
          // 🔧 新增：触发全局事件，通知所有组件设置已更新
          window.dispatchEvent(new CustomEvent('ai-settings-updated', {
            detail: {
              settings: serverSettings,
              version: serverVersion,
              timestamp: new Date().toISOString(),
              reason: forceUpdate ? '管理员强制更新' : '版本同步',
              forceUpdate: forceUpdate
            }
          }));
          
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ 检查AI设置更新失败:', error);
      return false;
    }
  }, [settingsVersion, isAIEnabled, currentModel]);// 🔄 自动同步设置当状态变化时
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
        }      } catch (error: any) {
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
  }, []);
  // 🔧 新增：定期检查AI设置更新（高频检查确保及时同步）
  useEffect(() => {
    if (!isInitialized) return;
    
    const intervalId = setInterval(async () => {
      try {
        const hasUpdates = await checkForUpdates();
        if (hasUpdates) {
          console.log('🔄 定期检查发现AI设置更新');
        }
      } catch (error) {
        console.warn('⚠️ 定期检查AI设置失败:', error);
      }
    }, 5000); // 🔧 改为每5秒检查一次，提高响应速度
    
    return () => clearInterval(intervalId);
  }, [isInitialized, checkForUpdates]);

  // 🔧 新增：监听页面焦点事件，当用户切回页面时检查更新
  useEffect(() => {
    const handleFocus = async () => {
      if (isInitialized) {
        console.log('🔄 页面重新获得焦点，检查AI设置更新...');
        try {
          const hasUpdates = await checkForUpdates();
          if (hasUpdates) {
            console.log('✅ 页面焦点检查发现AI设置更新');
          }
        } catch (error) {
          console.warn('⚠️ 页面焦点检查AI设置失败:', error);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isInitialized, checkForUpdates]);// 🔧 新增：监听localStorage变化，实现跨标签页AI设置同步
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'ai-settings-update-trigger') {
        console.log('🔄 检测到跨标签页AI设置更新信号');
        // 立即检查更新
        checkForUpdates().then(hasUpdates => {
          if (hasUpdates) {
            console.log('✅ 跨标签页AI设置同步成功');
          }
        });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [checkForUpdates]);

  // 🔧 新增：添加手动强制同步方法
  const forceSyncSettings = useCallback(async () => {
    console.log('🔄 执行强制AI设置同步...');
    setIsSyncing(true);
    try {
      const hasUpdates = await checkForUpdates();
      if (hasUpdates) {
        console.log('✅ 强制同步发现并应用了AI设置更新');
        
        // 触发跨标签页更新信号
        localStorage.setItem('ai-settings-update-trigger', Date.now().toString());
        setTimeout(() => {
          localStorage.removeItem('ai-settings-update-trigger');
        }, 1000);
      } else {
        console.log('ℹ️ 强制同步未发现AI设置更新');
      }
      return hasUpdates;
    } finally {
      setIsSyncing(false);
    }
  }, [checkForUpdates]);

  // 🔧 新增：页面可见性变化时检查更新
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isInitialized) {
        console.log('🔄 页面变为可见，检查AI设置更新...');
        forceSyncSettings();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isInitialized, forceSyncSettings]);// 保存AI总开关设置
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
        checkForUpdates,
        
        // 🔧 新增：强制同步方法
        forceSyncSettings
      }}
    >
      {children}
    </AIModelContext.Provider>
  );
};
