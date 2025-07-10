import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';

export type AIModel = 'local' | 'deepseek';

interface AIModelContextType {
  isAIEnabled: boolean;
  setIsAIEnabled: (enabled: boolean) => void;
  currentModel: AIModel;
  setCurrentModel: (model: AIModel) => void;
  isDeepSeekAvailable: boolean;
  setIsDeepSeekAvailable: (available: boolean) => void;
  isSyncing: boolean;
  lastSyncTime: Date | null;
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
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  const [currentModel, setCurrentModel] = useState<AIModel>('local');
  const [isDeepSeekAvailable, setIsDeepSeekAvailable] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'ai_settings_updated' && message.data.settings) {
      console.log('🔄 [WebSocket] 收到AI设置更新通知:', message.data);
      const { isAIEnabled, currentModel } = message.data.settings;
      const serverVersion = message.data.version;

      setSettingsVersion(prevVersion => {
        if (serverVersion > prevVersion) {
          setIsAIEnabled(isAIEnabled);
          setCurrentModel(currentModel);
          setLastSyncTime(new Date());
          console.log(`✅ [WebSocket] AI设置已更新至版本 ${serverVersion}`);
          return serverVersion;
        }
        return prevVersion;
      });
    }
  }, []);

  // 获取用户token用于WebSocket连接
  const userId = localStorage.getItem('userId');
  const token = userId ? `user_${userId}` : undefined;

  useWebSocket({ 
    onMessage: handleWebSocketMessage,
    token: token
  });

  const syncSettings = useCallback(async (settings: { isAIEnabled: boolean; currentModel: AIModel; reason: string }) => {
    const userRole = localStorage.getItem('userRole') || 'user';
    if (userRole !== 'admin') return; // 只有管理员可以同步设置

    setIsSyncing(true);
    try {
      const response = await axios.post('/api/system/sync-ai-settings', settings);
      if (response.data.success) {
        setSettingsVersion(response.data.version);
        setLastSyncTime(new Date());
        console.log('✅ AI设置同步成功', response.data);
      }
    } catch (error) {
      console.error('❌ AI设置同步失败:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    try {
      const response = await axios.get('/api/system/ai-settings-version');
      if (response.data.success) {
        const serverVersion = response.data.version;
        if (serverVersion > settingsVersion) {
          console.log('🔄 检测到AI设置更新，同步中...');
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
  }, [settingsVersion]);

  useEffect(() => {
    const initializeSettings = async () => {
      setIsInitialized(true);
      await checkForUpdates();
    };
    initializeSettings();
  }, [checkForUpdates]);

  const handleAIEnabledChange = (enabled: boolean) => {
    setIsAIEnabled(enabled);
    syncSettings({ isAIEnabled: enabled, currentModel, reason: 'AI总开关变更' });
  };

  const handleModelChange = (model: AIModel) => {
    setCurrentModel(model);
    syncSettings({ isAIEnabled, currentModel: model, reason: 'AI模型变更' });
  };

  return (
    <AIModelContext.Provider
      value={{
        isAIEnabled,
        setIsAIEnabled: handleAIEnabledChange,
        currentModel,
        setCurrentModel: handleModelChange,
        isDeepSeekAvailable,
        setIsDeepSeekAvailable,
        isSyncing,
        lastSyncTime,
        settingsVersion,
        checkForUpdates,
      }}
    >
      {children}
    </AIModelContext.Provider>
  );
};
