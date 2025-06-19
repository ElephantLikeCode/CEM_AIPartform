import React, { createContext, useContext, useState, useCallback } from 'react';

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
}

interface GenerationContextType {
  generationState: GenerationState;
  startGeneration: (type: 'file' | 'tag', info: any) => void;
  stopGeneration: () => void;
  isGenerationLocked: () => boolean;
}

const GenerationContext = createContext<GenerationContextType | null>(null);

export const GenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    generationType: null,
    generationInfo: null
  });
  const startGeneration = useCallback((type: 'file' | 'tag', info: any) => {
    console.log('🔒 启动全局生成锁定:', { type, info });
    setGenerationState({
      isGenerating: true,
      generationType: type,
      generationInfo: {
        materialName: info.name || info.fileName,
        materialId: info.materialId,
        materialType: info.materialType,
        userId: info.userId,
        startTime: new Date().toISOString()
      }
    });
  }, []);

  const stopGeneration = useCallback(() => {
    console.log('🔓 解除全局生成锁定');
    setGenerationState({
      isGenerating: false,
      generationType: null,
      generationInfo: null
    });
  }, []);

  const isGenerationLocked = useCallback(() => {
    return generationState.isGenerating;
  }, [generationState.isGenerating]);

  return (
    <GenerationContext.Provider value={{
      generationState,
      startGeneration,
      stopGeneration,
      isGenerationLocked
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
  const { isGenerationLocked } = useGeneration();
  
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
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666'
          }}>
            题目生成中，请稍等...
          </div>
        </div>
      )}
    </div>
  );
};
