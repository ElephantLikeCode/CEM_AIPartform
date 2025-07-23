import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { message } from 'antd';

// 全局生成状态管理
interface GenerationState {
  isGenerating: boolean;
  generationType: 'file' | 'tag' | null;
  generationInfo: {
    materialName?: string;
    materialId?: string | number;
    materialType?: 'file' | 'tag';
    userId?: number;
    startTime?: string;
  } | null;
  currentRequest: {
    controller: AbortController;
    requestId: string;
  } | null;
}

interface GenerationContextType {
  generationState: GenerationState;
  startGeneration: (type: 'file' | 'tag', info: any) => { controller: AbortController; requestId: string };
  stopGeneration: () => void;
  isGenerationLocked: () => boolean;
  cancelCurrentRequest: () => void;
  forceStopGeneration: () => void; // 强制停止，用于页面切换
}

const GenerationContext = createContext<GenerationContextType | null>(null);

export const GenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    generationType: null,
    generationInfo: null,
    currentRequest: null
  });

  const startGeneration = useCallback((type: 'file' | 'tag', info: any) => {
    console.log('🔒 启动全局生成锁定:', { type, info });
    
    // 使用setState的函数形式来访问最新状态
    const controller = new AbortController();
    const requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    setGenerationState(prevState => {
      // 如果有正在进行的请求，先取消它
      if (prevState.currentRequest) {
        console.log('🚫 取消前一个生成请求');
        prevState.currentRequest.controller.abort();
      }
      
      return {
        isGenerating: true,
        generationType: type,
        generationInfo: {
          materialName: info.name || info.fileName,
          materialId: info.materialId,
          materialType: info.materialType,
          userId: info.userId,
          startTime: new Date().toISOString()
        },
        currentRequest: {
          controller,
          requestId
        }
      };
    });
    
    return { controller, requestId };
  }, []);

  const stopGeneration = useCallback(() => {
    console.log('🔓 解除全局生成锁定');
    setGenerationState({
      isGenerating: false,
      generationType: null,
      generationInfo: null,
      currentRequest: null
    });
  }, []);

  const cancelCurrentRequest = useCallback(() => {
    setGenerationState(prevState => {
      if (prevState.currentRequest) {
        console.log('🚫 用户取消当前生成请求');
        prevState.currentRequest.controller.abort();
      }
      return {
        isGenerating: false,
        generationType: null,
        generationInfo: null,
        currentRequest: null
      };
    });
  }, []);

  const forceStopGeneration = useCallback(() => {
    console.log('🔒 强制停止生成（页面切换）');
    if (generationState.currentRequest) {
      generationState.currentRequest.controller.abort();
    }
    setGenerationState({
      isGenerating: false,
      generationType: null,
      generationInfo: null,
      currentRequest: null
    });
  }, [generationState.currentRequest]);

  const isGenerationLocked = useCallback(() => {
    return generationState.isGenerating;
  }, [generationState.isGenerating]);

  // 🔧 防止页面切换的监听器
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (generationState.isGenerating) {
        event.preventDefault();
        event.returnValue = '题目正在生成中，确定要离开吗？';
        return event.returnValue;
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      if (generationState.isGenerating) {
        event.preventDefault();
        const userConfirmed = window.confirm('题目正在生成中，确定要离开吗？');
        if (!userConfirmed) {
          // 如果用户取消，恢复历史状态
          window.history.pushState(null, '', window.location.href);
          return;
        } else {
          // 如果用户确认，取消当前请求
          forceStopGeneration();
        }
      }
    };

    if (generationState.isGenerating) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [generationState.isGenerating, forceStopGeneration]);

  return (
    <GenerationContext.Provider value={{
      generationState,
      startGeneration,
      stopGeneration,
      isGenerationLocked,
      cancelCurrentRequest,
      forceStopGeneration
    }}>
      {children}
    </GenerationContext.Provider>
  );
};

export const useGeneration = () => {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
};

// 全局生成锁定组件
export const GenerationLock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isGenerationLocked, cancelCurrentRequest, generationState } = useGeneration();
  
  return (
    <div style={{ 
      position: 'relative',
      pointerEvents: isGenerationLocked() ? 'none' : 'auto',
      opacity: isGenerationLocked() ? 0.6 : 1,
      transition: 'opacity 0.3s ease'
    }}>
      {children}
      {isGenerationLocked() && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          pointerEvents: 'auto' // 允许点击取消按钮
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '16px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#333',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            textAlign: 'center',
            minWidth: '200px'
          }}>
            <div style={{ marginBottom: '12px' }}>
              {generationState.generationType === 'tag' ? '标签题目生成中...' : '文件题目生成中...'}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
              {generationState.generationInfo?.materialName}
            </div>
            <button
              onClick={cancelCurrentRequest}
              style={{
                background: '#ff4d4f',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ff7875';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ff4d4f';
              }}
            >
              取消生成
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
