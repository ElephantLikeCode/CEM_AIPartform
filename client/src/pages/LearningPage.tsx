import React, { useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { 
  Card, Button, Steps, List, message, Modal, Input, Avatar, Spin, 
  Select, Empty, Divider, Progress, Typography, Space, Tag, Alert
} from 'antd';
import { 
  BookOutlined, CheckOutlined, QuestionOutlined, MessageOutlined, 
  RobotOutlined, UserOutlined, FileTextOutlined, ClockCircleOutlined,
  TrophyOutlined, PlayCircleOutlined, LeftOutlined, RightOutlined,
  ExclamationCircleOutlined, TagsOutlined, SettingOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { navigateToPage, PAGES } from '../utils/navigation';
import { useAIModel } from '../contexts/AIModelContext';

const { Step } = Steps;
const { TextArea } = Input;
const { Option } = Select;
const { Title, Paragraph, Text } = Typography;

// Tag-based learning has been removed - only per-document learning is supported

interface LearningMaterial {
  id: string;
  name: string;
  summary: string;
  stages: number;
  keyPoints: number;
  uploadTime: string;
  contentLength?: number;
}

interface StageContent {
  stage: number;
  title: string;
  keyPoints: string[];
  content: string;
}

interface LearningProgress {
  id: number;
  fileId?: string;
  learningType: 'file';
  current_stage: number;
  total_stages: number;
  completed: boolean;
  fileName?: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
  ragEnhanced?: boolean; // 🔧 新增：RAG增强标识
  relevantChunks?: number; // 🔧 新增：相关内容块数量
  fallback?: boolean; // 🔧 新增：降级处理标识
}

const LearningPage: React.FC = () => {
  const { currentModel, checkForUpdates, settingsVersion } = useAIModel(); // 🤖 获取当前AI模型和同步功能
  
  // 🔧 新增：移动端检测
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  // Tag-based learning has been removed
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [currentStage, setCurrentStage] = useState(1);
  const [totalStages, setTotalStages] = useState(0);
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [learning, setLearning] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  // Tag-based loading removed
  
  // 🔧 新增：监听AI对话窗口状态变化，通知App组件
  useEffect(() => {
    if (chatVisible) {
      // 触发AI对话打开事件
      window.dispatchEvent(new CustomEvent('ai-modal-open'));
    } else {
      // 触发AI对话关闭事件
      window.dispatchEvent(new CustomEvent('ai-modal-close'));
    }
  }, [chatVisible]);
  
  // 🔄 新增：用户会话管理
  const [sessionValid, setSessionValid] = useState(true);
  const [lastValidationTime, setLastValidationTime] = useState<Date>(new Date());

  // 模拟用户ID
  const userId = Number(localStorage.getItem('userId'));

  const isLoadingMaterials = useRef(false);
  const isLoadingProgress = useRef(false);
  const lastLoadTime = useRef<number>(0);
  const LOAD_DEBOUNCE_TIME = 2000; // 2 seconds debounce
  const hasInitialized = useRef(false); // 防止重复初始化
  // 🔄 验证用户会话和学习状态
  const validateSession = useCallback(async () => {
    // 如果用户没有在学习中，跳过验证
    if (!learning) return;
    
    try {
      const response = await axios.get(`/api/learning/validate-session/${userId}`);
      const sessionData = response.data.data;
      
      if (!sessionData.sessionValid) {
        setSessionValid(false);
        message.warning('学习会话已过期，请重新开始学习');
        
        // 清理本地状态
        setLearning(false);
        setProgress(null);
        setChatMessages([]);
      } else {
        setSessionValid(true);
        setLastValidationTime(new Date());
      }
    } catch (error) {
      console.error('❌ 会话验证失败:', error);
    }
  }, [userId]);
  
  // 🔄 定期检查设置更新和会话状态
  useEffect(() => {
    const interval = setInterval(async () => {
      // 检查AI设置更新
      const hasUpdates = await checkForUpdates();
      if (hasUpdates) {
        message.info('AI模型设置已更新');
      }
      
      // 验证用户会话
      if (learning) {
        await validateSession();
      }
    }, 30000); // 每30秒检查一次
    
    return () => clearInterval(interval);
  }, [learning, checkForUpdates, validateSession]);
  // Tag-based learning functions have been removed

  // 验证学习材料是否仍然存在
  const validateLearningMaterial = async (fileId: string) => {
    try {
      // Validating learning material existence
      const materialsResponse = await axios.get('/api/learning/materials');
      
      if (materialsResponse.data.success) {
        const availableMaterials = materialsResponse.data.data || [];
        const materialExists = availableMaterials.some((material: LearningMaterial) => material.id === fileId);
        
        // Material validation completed
        return materialExists;
      }
      
      return false;
    } catch (error) {
      console.error('❌ 验证学习材料失败:', error);
      return false;
    }
  };
  // Tag validation function has been removed

  // 🔧 增强：清理无效的学习进度 - 改进错误处理
  const clearInvalidProgress = async () => {
    try {
      console.log('🧹 清理无效的学习进度...');
      
      // 🔧 调用新的清理API
      const response = await axios.post(`/api/learning/progress/cleanup/${userId}`);
      
      if (response.data.success) {
        console.log(`✅ 服务器端无效进度清理成功: 清理了${response.data.cleanedCount}条记录`);
      }
      
    } catch (error: any) {
      console.error('❌ 清理学习进度失败:', error);
      
      // 🔧 即使服务器清理失败，也要确保本地状态清理
      if (error.response?.status === 404) {
        console.log('ℹ️ 清理API端点不存在，仅清理本地状态');
      }
    } finally {
      // 🔧 确保本地状态总是被清理      setProgress(null);
      setLearning(false);
      setCurrentStage(1);
      setTotalStages(0);
      setStageContent(null);
      setSelectedMaterial('');
      // Tag-related state cleanup removed
      setChatMessages([]);
      
      message.warning({
        content: '检测到学习材料已被删除，已自动清理相关学习进度',
        duration: 4
      });
    }
  };

  // 🔧 修复：載入可用學習材料 - 增强错误处理和调试信息
  const loadMaterials = async () => {
    if (isLoadingMaterials.current) return;
    isLoadingMaterials.current = true;

    setMaterialsLoading(true);
    try {
      // Starting to load learning materials
      const response = await axios.get('/api/learning/materials');
      
      // Learning materials API response received
      
      if (response.data.success) {
        const materialsData = response.data.data || [];
          // Materials data processing
        
        // 🔧 详细验证每个材料的数据结构
        const processedMaterials = materialsData.map((material: any, index: number) => {          // Processing material ${index + 1}
          
          return {
            id: material.id,
            name: material.name || `未知文档 ${index + 1}`,
            summary: material.summary || `学习文档：${material.name}`,
            stages: material.stages || 1,
            keyPoints: material.keyPoints || 0,
            uploadTime: material.uploadTime,
            uploadTimestamp: material.uploadTimestamp,
            fileType: material.fileType,
            canLearn: material.canLearn !== false,
            learningReady: material.learningReady !== false,
            contentLength: material.contentLength || 0,
            hasContent: material.hasContent || false
          };
        });
          // Processed materials list ready
        
        setMaterials(processedMaterials);
        // Learning materials loaded successfully
        
        if (processedMaterials.length === 0) {
          console.log('ℹ️ 没有找到可用的学习材料');
          console.log('📊 调试信息:', response.data.debug);
          
          // 🔧 提供更详细的提示信息
          if (response.data.debug?.totalFiles > 0) {
            message.info({
              content: `发现${response.data.debug.totalFiles}个文件，但都未完成AI分析。请等待文件分析完成后重试。`,
              duration: 6
            });
          } else {
            message.info({
              content: '暂无上传的文件。请先在"文档管理"页面上传学习文档。',
              duration: 5
            });
          }
        }
      } else {
        throw new Error(response.data.message || '获取学习材料失败');
      }
      
    } catch (error: any) {
      console.error('❌ 加载学习材料失败:', error);
      console.error('错误详情:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // 🔧 增强错误处理
      let errorMessage = '載入學習材料失敗';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      message.error({
        content: `${errorMessage}。请检查网络连接或稍后重试。`,
        duration: 5
      });
      
      // 🔧 设置空数组防止界面错误
      setMaterials([]);
    } finally {
      setMaterialsLoading(false);
      isLoadingMaterials.current = false;
    }
  };
  // Tag learning function has been removed

  const startLearning = async () => {
    if (!selectedMaterial) {
      message.warning('請選擇學習材料');
      return;
    }

    // 验证材料是否还存在
    const materialExists = await validateLearningMaterial(selectedMaterial);
    if (!materialExists) {
      message.error('选择的学习材料不存在或已被删除，请重新选择');
      setSelectedMaterial('');
      return;
    }

    try {
      const response = await axios.post('/api/learning/start', {
        userId,
        fileId: selectedMaterial
      });
        setTotalStages(response.data.totalStages);
      setCurrentStage(response.data.currentStage);
      setLearning(true);
      // Learning mode is always 'file' now
      
      await loadStageContent(response.data.currentStage);
      message.success(response.data.message);
    } catch (error: any) {
      console.error('❌ 开始学习失败:', error);
      
      if (error.response?.status === 404) {
        message.error('学习材料不存在或已被删除，请重新选择');
        //setSelectedMaterial('');
      } else {
        message.error(error.response?.data?.message || '開始學習失敗');
      }
    }
  };

  const loadStageContent = async (stage: number) => {
    try {
      console.log(`🔄 加载阶段${stage}内容...`);
      const response = await axios.get(`/api/learning/stage/${userId}/${stage}`);
      
      if (response.data.success) {
        setStageContent(response.data.data);
        console.log(`✅ 阶段${stage}内容加载成功:`, response.data.data.title);
      } else {
        throw new Error(response.data.message || '加载失败');
      }
    } catch (error: any) {
      console.error(`❌ 加载阶段${stage}内容失败:`, error);
        if (error.response?.status === 404) {
        // 学习进度或材料不存在，清理无效状态
        Modal.confirm({
          title: '学习材料已失效',
          icon: <ExclamationCircleOutlined />,
          content: '检测到当前学习的材料已被删除或失效。是否清理相关学习进度并重新开始？',
          okText: '确定清理',
          cancelText: '取消',
          centered: isMobile,
          width: isMobile ? '90vw' : 416,
          onOk: () => {
            clearInvalidProgress();
          },
          onCancel: () => {
            setLearning(false);
          }
        });
      } else {
        message.error('加载阶段内容失败: ' + (error.response?.data?.message || error.message));
      }
    }
  };
  const loadProgress = async () => {
    if (isLoadingProgress.current) return;
    
    // Add debouncing to prevent rapid successive calls
    const now = Date.now();
    if (now - lastLoadTime.current < LOAD_DEBOUNCE_TIME) {
      return;
    }
    lastLoadTime.current = now;
    
    isLoadingProgress.current = true;    try {
      // Loading user progress - silently handle 404 as normal
      const response = await axios.get(`/api/learning/progress/${userId}`, {
        validateStatus: function (status) {
          return status < 500; // Don't throw for 404, only for 5xx errors
        }
      });
        if (response.status === 200 && response.data.success) {        const progressData = response.data.data;
        
        // 🔧 如果沒有學習進度，直接返回
        if (!progressData) {
          console.log('ℹ️ 用戶暫無學習進度');
          return;
        }
        
        console.log('✅ 学习进度加载成功:', progressData);
        
        // Validate file-based learning only
        if (progressData.learningType === 'file' && progressData.fileId) {
          const materialExists = await validateLearningMaterial(progressData.fileId);
          if (!materialExists) {
            console.log('⚠️ 学习进度对应的材料已不存在，清理进度...');
            await clearInvalidProgress();
            return;
          }
          setSelectedMaterial(progressData.fileId);
        }
        
        setProgress(progressData);
        setCurrentStage(progressData.current_stage);
        setTotalStages(progressData.total_stages);
        setLearning(true);
        
        await loadStageContent(progressData.current_stage);
      }    } catch (error: any) {
      // No learning progress found - this is normal for new users
      // Don't show any error message as this is expected behavior
    } finally {
      isLoadingProgress.current = false;
    }
  };  useEffect(() => {
    // 防止重复初始化，特别是在React严格模式下
    if (hasInitialized.current) return;
    hasInitialized.current = true;
      // 直接调用函数，避免依赖项问题
    const initializePage = async () => {
      try {
        // Only load materials for file-based learning
        await loadMaterials();
        await loadProgress();
      } catch (error) {
        console.error('页面初始化失败:', error);
      }
    };
    
    initializePage();
  }, []);  const handleSendMessage = async () => {
    if (!currentQuestion.trim()) return;
    
    // 🔧 更智能的验证：检查是否有学习进度或正在学习状态
    const hasLearningProgress = progress && progress.current_stage > 0;
    const isCurrentlyLearning = learning && stageContent;
    
    if (!sessionValid || (!hasLearningProgress && !isCurrentlyLearning)) {
      message.error('请先开始学习，然后再提问');
      return;
    }

    // 🔧 添加调试日志，确保这个函数只处理聊天
    console.log('💬 发送AI消息:', currentQuestion.substring(0, 50) + '...');

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: currentQuestion,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setCurrentQuestion('');
    setIsAiThinking(true);

    try {
        // 构建更详细的上下文信息 - 只支持文件学习
      const chatContext = stageContent ? {
        learningType: 'file',
        fileName: progress?.fileName || '当前学习文件',
        currentStage: currentStage,
        totalStages: totalStages,
        stageTitle: stageContent.title,
        stageContent: stageContent.content,
        keyPoints: stageContent.keyPoints,
        userId: userId, // 🔄 添加用户ID用于并发控制
        sessionId: `${userId}_${Date.now()}`, // 🔄 会话标识
        settingsVersion: settingsVersion // 🔄 设置版本号
      } : '当前学习内容';      console.log('📤 发送聊天请求到后端...');
      console.log('🤖 当前AI模型:', currentModel);
      console.log('⚙️ 设置版本:', settingsVersion);
      
      const endpoint = currentModel === 'deepseek' ? '/api/ai/chat-with-model' : '/api/ai/chat';
      console.log('📡 请求接口:', endpoint);
      
      // 🤖 根据AI模型优化请求数据和提示词
      const requestData = currentModel === 'deepseek' 
        ? {question: `作为专业的学习导师，请基于当前学习内容详细回答学生的问题。

学习上下文：
- 学习模式：单文档学习
- 当前阶段：第${currentStage}阶段（共${totalStages}阶段）
- 阶段标题：${stageContent?.title || '无'}
${progress?.fileName ? `- 学习文件：${progress.fileName}` : ''}

学生问题：${userMessage.content}

请用以下格式回答：
1. 首先简洁地直接回答问题
2. 然后提供详细的解释和背景知识
3. 如果适用，联系当前学习内容举例说明
4. 最后提供学习建议或延伸思考
5. 保持专业而友好的语调，用繁体中文回答`,
            userId: userId,
            context: chatContext,
            stage: currentStage,
            model: currentModel,
            enhancedPrompt: true // 标记为增强提示词
          }
        : {
            question: userMessage.content,
            userId: userId,
            context: chatContext,
            stage: currentStage
          };
      
      const response = await axios.post(endpoint, requestData);

      console.log('📥 收到AI回复:', response.data.success);

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: response.data.data.response,
        timestamp: response.data.data.timestamp,
        ragEnhanced: response.data.data.ragEnhanced, // 🔧 新增
        relevantChunks: response.data.data.relevantChunks, // 🔧 新增
        fallback: response.data.data.fallback // 🔧 新增
      };      setChatMessages(prev => [...prev, aiMessage]);
      console.log('✅ AI聊天完成，无页面跳转');
    } catch (error: any) {
      console.error('❌ AI对话失败:', error);
      console.log('🔍 错误详情 - 不应该导致页面跳转:', {
        status: error.response?.status,
        message: error.message,
        url: error.config?.url
      });
      
      // 添加错误消息到聊天
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: '抱歉，我暂时无法回答您的问题。可能是因为：\n1. AI服务暂时不可用\n2. 学习上下文加载失败\n\n请稍后重试，或者重新开始学习。',
        timestamp: new Date().toISOString()
      };
      
      setChatMessages(prev => [...prev, errorMessage]);
      message.error('AI对话失败，请稍后再试');
    } finally {
      setIsAiThinking(false);
      console.log('💬 AI聊天请求结束');
    }
  };

  const nextStage = async () => {
    if (currentStage < totalStages) {
      const nextStageNum = currentStage + 1;
      setCurrentStage(nextStageNum);
      await loadStageContent(nextStageNum);
        // 更新進度
      try {
        await axios.put(`/api/learning/progress/${userId}`, {
          stage: nextStageNum,
          completed: nextStageNum === totalStages,
          action: 'next_stage'
        });
        message.success(`進入第 ${nextStageNum} 階段`);
      } catch (error) {
        console.error('更新進度失敗:', error);
      }
    }
  };

  const prevStage = async () => {
    if (currentStage > 1) {
      const prevStageNum = currentStage - 1;
      setCurrentStage(prevStageNum);
      await loadStageContent(prevStageNum);
        // 更新進度
      try {
        await axios.put(`/api/learning/progress/${userId}`, {
          stage: prevStageNum,
          completed: false,
          action: 'prev_stage'
        });
        message.success(`返回第 ${prevStageNum} 階段`);
      } catch (error) {
        console.error('更新進度失敗:', error);
      }
    }
  };

  const goToStage = async (stage: number) => {
    setCurrentStage(stage);
    await loadStageContent(stage);
      // 更新進度
    try {
      await axios.put(`/api/learning/progress/${userId}`, {
        stage: stage,
        completed: stage === totalStages,
        action: 'set_stage'
      });
      message.success(`跳轉到第 ${stage} 階段`);
    } catch (error) {
      console.error('更新進度失敗:', error);
    }
  };
  const proceedToQuiz = () => {
    console.log('🔍 检查测试所需数据:', {
      progress: progress ? {
        fileName: progress.fileName,
        fileId: progress.fileId,
        learningType: progress.learningType
      } : null,
      selectedMaterial
    });

    // Only support file-based testing
    if (progress?.fileId || selectedMaterial) {
      // 文件测试逻辑保持不变
      let fileId = progress?.fileId || selectedMaterial;
      let fileName = progress?.fileName || '学习材料';
      
      if (!fileId) {
        message.error('无法确定学习文件，请重新开始学习');
        return;
      }

      console.log('🔄 准备跳转到文件测试页面...', { fileId, fileName });

      const params = new URLSearchParams({
        userId: userId.toString(),
        fileId: fileId,
        fileName: fileName,
        count: '8'
      });
      
      const quizUrl = `${PAGES.QUIZ}?${params.toString()}`;
      console.log('🔗 文件测试页面URL:', quizUrl);
      
      try {
        navigateToPage(quizUrl);
      } catch (error) {
        console.error('页面跳转失败:', error);
        message.error('无法跳转到测试页面，请稍后重试');
      }
    } else {
      message.error('无法确定学习内容，请重新开始学习');
    }
  };
  const resetLearning = () => {
    Modal.confirm({
      title: '确认重新选择学习材料',
      icon: <ExclamationCircleOutlined />,
      content: '重新选择将清除当前的学习进度，确定要继续吗？',
      okText: '确定',
      cancelText: '取消',
      centered: isMobile,
      width: isMobile ? '90vw' : 416,
      onOk: async () => {
        // 先清理本地状态
        setLearning(false);
        setCurrentStage(1);
        setTotalStages(0);
        setStageContent(null);        setProgress(null);
        setSelectedMaterial('');
        // Tag-related state cleanup removed
        setChatMessages([]);
        
        // 🔧 增强：清理服务器端进度 - 增加错误处理
        try {
          console.log(`🔄 重置用户${userId}的服务器端学习进度...`);
          const response = await axios.post(`/api/learning/progress/reset/${userId}`);
          
          if (response.data.success) {
            console.log('✅ 服务器端学习进度已重置');
            message.success('学习进度已重置，可以重新选择学习材料');
          } else {
            console.warn('⚠️ 服务器端进度重置响应异常:', response.data);
          }
        } catch (error: any) {
          console.error('❌ 重置服务器端进度失败:', error);
          
          // 🔧 提供更友好的错误处理
          if (error.response?.status === 404) {
            console.log('ℹ️ 重置API端点不存在，但本地状态已清理');
            message.info('学习进度已清理，可以重新开始学习');
          } else {
            message.warning('本地学习进度已清理，但服务器同步可能失败');
          }
        }
      }
    });
  };  // 🤖 AI模型状态监听和调试
  useEffect(() => {
    console.log('🤖 AI模型状态变化:', {
      currentModel,
      settingsVersion,
      timestamp: new Date().toISOString()
    });
  }, [currentModel, settingsVersion]);

  // 🔄 页面加载时强制检查AI设置更新
  useEffect(() => {
    const initializeAISettings = async () => {
      try {
        console.log('🔄 学习页面加载，检查AI设置更新...');
        const hasUpdates = await checkForUpdates();
        if (hasUpdates) {
          console.log('✅ AI设置已更新，界面将同步显示');
        } else {
          console.log('📋 AI设置无变化');
        }
      } catch (error) {
        console.error('❌ 检查AI设置失败:', error);
      }
    };
    
    initializeAISettings();
  }, []); // 只在组件加载时执行一次

  if (!learning) {    return (
      <div className="page-container learning-page-container" style={{ maxWidth: 1200, margin: '0 auto' }}>{/* 移除AI模型设置区域 - 仅管理员可在数据库页面调整 */}
        
        <Card 
          className="learning-selection-card"
          title={
            <Space>
              <BookOutlined />
              <span>选择学习方式</span>
            </Space>
          } 
          style={{ marginBottom: 24, background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(10px)', border: 'none', borderRadius: '12px' }}
        >
          {/* 🏷️ 新增：学习模式选择 */}          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Title level={2} className="learning-page-title" style={{ marginBottom: 16 }}>
              🎓 歡迎來到AI智能學習平台
            </Title>
            <Paragraph style={{ fontSize: 16, color: '#666', maxWidth: 600, margin: '0 auto' }}>
              AI將為您的單文檔學習量身定制個性化的學習體驗。
            </Paragraph>
          </div>

          {/* 直接显示文件学习选择器 */}          <div>
            {materialsLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text>正在加载学习材料...</Text>
                </div>
              </div>
              ) : materials.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div>
                        <Text style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
                          暂无可用的单文档学习材料
                        </Text>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                          可能的原因：<br />
                          1. 文件尚未完成AI分析<br />
                          2. 文件内容不足以生成学习阶段<br />
                          3. 还没有上传任何文档
                        </Text>
                        {/* 🔧 新增：调试按钮 */}
                        <Button 
                          type="link" 
                          size="small"
                          onClick={() => {
                            console.log('🔍 当前材料状态:', materials);
                            console.log('🔍 重新加载材料...');
                            loadMaterials();
                          }}
                          style={{ marginBottom: 8 }}
                        >
                          🔄 重新加载
                        </Button>
                      </div>
                    }
                  >
                  </Empty>
                </div>
              ) : (
                <div style={{ 
                  background: '#fafafa', 
                  padding: '32px 24px', 
                  borderRadius: 8, 
                  marginBottom: 32,
                  maxWidth: 800,
                  margin: '0 auto 32px auto'
                }}>\
                  <Title level={4} className="learning-section-title" style={{ marginBottom: 24, textAlign: 'left' }}>
                    📚 選擇學習教材：({materials.length}个可用)
                  </Title>
                  
                  {/* 🔧 新增：显示材料加载状态 */}
                  <div style={{ marginBottom: 16, padding: 8, background: '#f0f9ff', borderRadius: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      💡 找到 {materials.length} 个可用的学习材料
                    </Text>
                  </div>
                  
                  <div style={{ marginBottom: 16 }}>
                    <Select
                      style={{ width: '100%', textAlign: 'left' }}
                      placeholder="請選擇要學習的教材"
                      value={selectedMaterial}
                      onChange={setSelectedMaterial}
                      loading={materialsLoading}
                      size="large"
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                      }
                    >
                      {materials.map(material => (                        <Option key={material.id} value={material.id}>                          <div style={{ padding: '8px 0' }} className="learning-material-option learning-material-container">
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }} className="learning-material-title">
                              📖 {material.name}
                            </div>
                            <div style={{ fontSize: 12, color: '#666' }}>
                              {material.stages}个阶段 • {material.contentLength ? `${Math.round(material.contentLength/1000)}k字符` : '内容已准备'}
                            </div>
                          </div>
                        </Option>
                      ))}
                    </Select>
                  </div>

                  {selectedMaterial && (
                    <div style={{ marginTop: 16 }}>
                      {(() => {
                        const material = materials.find(m => m.id === selectedMaterial);
                        return material ? (                          <Card 
                            size="default" 
                            className="learning-material-container"
                            style={{ 
                              textAlign: 'left', 
                              background: '#f8f9fa',
                              border: '1px solid #e8f4f8'
                            }}
                          ><div style={{ marginBottom: 16 }}>
                              <Title level={3} style={{ margin: 0, color: '#1890ff' }} className="learning-material-title">
                                📖 {material.name}
                              </Title>
                            </div>
                            
                            <div style={{ marginBottom: 16 }}>
                              <Space wrap size={4}>
                                <Tag color="blue">
                                  {material.stages}个学习阶段
                                </Tag>
                                <Tag color="purple">
                                  {material.contentLength ? `${Math.round(material.contentLength/1000)}k字符` : '内容就绪'}
                                </Tag>
                                <Tag color="green">
                                  可开始学习
                                </Tag>
                              </Space>
                            </div>
                            
                            <div style={{ marginBottom: 20 }}>
                              <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#555' }}>
                                {material.summary}
                              </Text>
                            </div>
                            
                            <div style={{ 
                              background: '#fff', 
                              padding: 16, 
                              borderRadius: 6,
                              border: '1px solid #e0e0e0'
                            }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>
                                💡 學習提示：系統將為您生成個性化的學習路徑，您可以按階段逐步學習，
                                隨時向AI助手提問，獲得即時的學習指導和答疑服務。
                              </Text>
                            </div>
                          </Card>
                        ) : null;
                      })()}
                    </div>
                  )}

                  <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <Button 
                      type="primary" 
                      size="large" 
                      icon={<PlayCircleOutlined />}
                      onClick={startLearning}
                      disabled={!selectedMaterial}
                      className="start-learning-button"
                      style={{ 
                        height: 48, 
                        paddingLeft: 32, 
                        paddingRight: 32,
                        fontSize: 16,
                        fontWeight: 600,
                        border: 'none'
                      }}
                    >
                      🚀 開始文檔學習
                    </Button>
                    
                    {!selectedMaterial && (
                      <div style={{ marginTop: 12 }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          請先選擇一個學習教材
                        </Text>
                      </div>
                    )}
                  </div>                </div>
              )}
            </div>
        </Card>
      </div>
    );
  }
  return (
    <div className="page-container learning-page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 移除AI模型设置区域 - 仅管理员可在数据库页面调整 */}
        {/* 學習進度卡片 - 只支持文件学习模式 */}
      <Card
        className="learning-progress-card"
        title={
          <Space>
            <BookOutlined />
            <span>
              📖 {progress?.fileName || '文檔學習'}
            </span>
            <Tag color="blue" style={{ marginLeft: 8 }}>
              第 {currentStage} 階段 / 共 {totalStages} 階段
            </Tag>
            {/* 只显示单文档学习标识 */}
            <Tag color="green">
              單文檔學習
            </Tag>
          </Space>
        }        extra={
          <Space direction={isMobile ? "vertical" : "horizontal"} size={isMobile ? "small" : "middle"}>
            <Button 
              size="small" 
              onClick={resetLearning}
              style={{ width: isMobile ? '100px' : 'auto' }}
            >
              重新選擇
            </Button>            <Button 
              size="small" 
              type="primary" 
              ghost
              icon={<MessageOutlined />}
              style={{ width: isMobile ? '100px' : 'auto' }}
              onClick={() => {
                // 🔧 智能验证：检查是否有学习进度或正在学习状态
                const hasLearningProgress = progress && progress.current_stage > 0;
                const isCurrentlyLearning = learning && stageContent;
                
                if (!hasLearningProgress && !isCurrentlyLearning) {
                  message.warning('请先开始学习，然后再使用AI助手');
                  return;
                }
                
                setChatVisible(!chatVisible);
              }}
            >
              AI助手
            </Button>
          </Space>
        }
        style={{ marginBottom: 24, background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(10px)', border: 'none', borderRadius: '12px' }}
      >
        {/* 可點擊的進度條 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 16 
          }}>
            <Text strong style={{ fontSize: 14 }}>
              📊 學習進度 (點擊步驟跳轉)
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              進度：{Math.round((currentStage / totalStages) * 100)}%
            </Text>
          </div>
          
          <Steps 
            current={currentStage - 1} 
            size="small" 
            type="navigation"
            style={{ marginBottom: 16 }}
          >
            {Array.from({ length: totalStages }, (_, i) => (
              <Step 
                key={i + 1} 
                title={`階段 ${i + 1}`}
                icon={i + 1 <= currentStage ? <CheckOutlined /> : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => goToStage(i + 1)}
                status={i + 1 === currentStage ? 'process' : (i + 1 < currentStage ? 'finish' : 'wait')}
              />
            ))}
          </Steps>
        </div>
        
        <div style={{ marginBottom: 20 }}>
          <Progress 
            percent={Math.round((currentStage / totalStages) * 100)} 
            status="active"
            format={() => `${currentStage}/${totalStages}`}
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
          />
        </div>

        {/* 快速導航按鈕 */}
        <div style={{ textAlign: 'center' }}>
          <Space wrap>
            <Button 
              disabled={currentStage === 1}
              icon={<LeftOutlined />}
              onClick={prevStage}
            >
              上一階段
            </Button>
            
            <Select
              value={currentStage}
              onChange={goToStage}
              style={{ minWidth: 140 }}
              size="middle"
            >
              {Array.from({ length: totalStages }, (_, i) => (
                <Option key={i + 1} value={i + 1}>
                  第 {i + 1} 階段
                </Option>
              ))}
            </Select>
            
            <Button 
              disabled={currentStage === totalStages}
              icon={<RightOutlined />}
              onClick={nextStage}
            >
              下一階段
            </Button>
          </Space>
        </div>
      </Card>

      {/* 階段內容卡片 */}
      {stageContent && (        <Card 
          title={
            <Space>
              <FileTextOutlined />
              <span className="stage-title">{stageContent.title}</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <div style={{ marginBottom: 24 }}>
            <Title level={4} style={{ marginBottom: 16, color: '#1890ff' }}>
              🎯 本階段學習目標
            </Title>
            <div>
              {stageContent.keyPoints.map((point, index) => (
                <div key={index} style={{ padding: '8px 0', display: 'flex', alignItems: 'flex-start' }}>
                  <CheckOutlined style={{ color: '#52c41a', marginTop: 4, marginRight: 8 }} />
                  <Text style={{ fontSize: 15, lineHeight: 1.6 }}>{point}</Text>
                </div>
              ))}
            </div>
          </div>
          
          <Divider />
          
          <div style={{ marginBottom: 32 }}>
            <Title level={4} style={{ marginBottom: 16, color: '#1890ff' }}>
              📚 課程學習內容
            </Title>
            <div style={{ 
              background: '#fafafa', 
              padding: 24, 
              borderRadius: 8,
              lineHeight: 1.8,
              fontSize: 15,
              border: '1px solid #f0f0f0'
            }}>
              <Paragraph style={{ 
                margin: 0, 
                whiteSpace: 'pre-wrap',
                fontSize: 15,
                color: '#333'
              }}>
                {stageContent.content}
              </Paragraph>
            </div>
          </div>
            <div style={{ 
            textAlign: 'center', 
            padding: '20px 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <Space size={isMobile ? "middle" : "large"} direction={isMobile ? "vertical" : "horizontal"} style={{ width: isMobile ? '100%' : 'auto' }}>              <Button 
                icon={<MessageOutlined />}
                onClick={() => {
                  // 🔧 智能验证：检查是否有学习进度或正在学习状态
                  const hasLearningProgress = progress && progress.current_stage > 0;
                  const isCurrentlyLearning = learning && stageContent;
                  
                  if (!hasLearningProgress && !isCurrentlyLearning) {
                    message.warning('请先开始学习，然后再使用AI助手');
                    return;
                  }
                  
                  setChatVisible(true);
                }}
                size="large"
                style={{ 
                  height: 40,
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                💬 向AI提問
              </Button>
                {currentStage < totalStages ? (
                <Button 
                  type="primary" 
                  onClick={nextStage}
                  size="large"
                  style={{ 
                    height: 40,
                    width: isMobile ? '100%' : 'auto'
                  }}
                >
                  ▶️ 下一階段 ({currentStage + 1}/{totalStages})
                </Button>
              ) : (
                <Button 
                  type="primary" 
                  icon={<TrophyOutlined />} 
                  onClick={proceedToQuiz}
                  size="large"
                  style={{ 
                    height: 40,
                    width: isMobile ? '100%' : 'auto'
                  }}
                >
                  🏆 完成學習，進入測試
                </Button>
              )}
            </Space>
          </div>
        </Card>
      )}      {/* AI對話模態框 - 优化顶部布局，使其更大更美观 */}
      <Modal
        title={<div style={{ 
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            margin: isMobile ? '-8px -8px 12px -8px' : '-16px -24px 16px -24px',
            padding: isMobile ? '12px 16px' : '20px 24px',
            borderBottom: '1px solid #e8f4fd',
            borderRadius: '8px 8px 0 0'
          }}>
            {/* 主标题行 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: isMobile ? '8px' : '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                <div style={{ 
                  background: '#52c41a', 
                  borderRadius: '50%', 
                  padding: isMobile ? '6px' : '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <RobotOutlined style={{ color: '#fff', fontSize: isMobile ? '14px' : '18px' }} />
                </div>
                <div>
                  <Title level={isMobile ? 5 : 4} style={{ margin: 0, color: '#1890ff' }}>
                    AI學習助手
                  </Title>
                  {!isMobile && (
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      智能问答 · 学习辅导 · 知识检索
                    </Text>
                  )}
                </div>
              </div>
                {/* AI模型状态指示器 */}
              {!isMobile && (
                <div style={{ textAlign: 'right' }}>
                  <Tag 
                    color={currentModel === 'deepseek' ? 'blue' : 'green'}
                    style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '12px' }}
                  >
                    <SettingOutlined style={{ marginRight: '4px' }} />
                    {currentModel === 'deepseek' ? 'DeepSeek API' : '本地模型'}
                  </Tag>
                </div>
              )}
            </div>
              {/* 学习上下文信息行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '8px', flexWrap: 'wrap' }}>
              {stageContent && (
                <Tag 
                  color="blue" 
                  icon={!isMobile ? <BookOutlined /> : undefined}
                  style={{ 
                    borderRadius: '12px', 
                    padding: isMobile ? '2px 8px' : '4px 12px',
                    fontSize: isMobile ? '11px' : '12px'
                  }}
                >
                  {isMobile ? '當前階段' : stageContent.title}
                </Tag>
              )}
              {!isMobile && (
                <Tag 
                  color="green" 
                  icon={<FileTextOutlined />}
                  style={{ borderRadius: '12px', padding: '4px 12px' }}
                >
                  單文檔學習
                </Tag>
              )}
              {selectedMaterial && !isMobile && (
                <Tag 
                  color="purple" 
                  icon={<TagsOutlined />}
                  style={{ borderRadius: '12px', padding: '4px 12px' }}
                >
                  {materials.find(m => m.id === selectedMaterial)?.name || '学习材料'}
                </Tag>
              )}
              <Tag 
                color="orange" 
                style={{ 
                  borderRadius: '12px', 
                  padding: isMobile ? '2px 8px' : '4px 12px',
                  fontSize: isMobile ? '11px' : '12px'
                }}
              >
                {isMobile ? `${currentStage}/${totalStages}` : `阶段 ${currentStage}/${totalStages}`}
              </Tag>
            </div>
          </div>        }
        open={chatVisible}
        onCancel={() => setChatVisible(false)}
        footer={null}
        width={isMobile ? '95vw' : 750}
        style={{ top: isMobile ? 20 : 20 }}
        centered={isMobile}
        className="ai-chat-modal"styles={{
          header: { 
            padding: 0,
            background: 'transparent',
            borderBottom: 'none'
          },
          body: { 
            padding: isMobile ? '0 8px 8px 8px' : '0 24px 24px 24px',
            borderRadius: isMobile ? '0 0 12px 12px' : 'inherit'
          },
          content: {
            borderRadius: isMobile ? '12px' : '8px',
            overflow: 'hidden'
          }
        }}
      >        <div style={{ 
          height: isMobile ? '400px' : '500px', 
          overflowY: 'auto', 
          marginBottom: isMobile ? '16px' : '20px',
          background: '#fafafa',
          borderRadius: '8px',
          padding: isMobile ? '8px' : '12px',
          border: '1px solid #f0f0f0'
        }}>
          {chatMessages.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              background: '#fff',
              borderRadius: 6,
              margin: 8
            }}>
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Text style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
                      🤖 AI助手已準備就緒
                    </Text>                    <Text type="secondary">
                      向我提問任何關於當前學習內容的問題吧！
                    </Text>
                  </div>
                }
              />
            </div>
          ) : (            <List
              dataSource={chatMessages}
              renderItem={(message) => (
                <List.Item style={{ 
                  border: 'none', 
                  padding: isMobile ? '8px 4px' : '12px 8px',
                  marginBottom: isMobile ? 6 : 8
                }}>
                  <div style={{ 
                    width: '100%',
                    background: '#fff',
                    borderRadius: 8,
                    padding: isMobile ? 12 : 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    <List.Item.Meta
                      avatar={
                        <Avatar 
                          icon={message.type === 'user' ? <UserOutlined /> : <RobotOutlined />}
                          style={{ 
                            backgroundColor: message.type === 'user' ? '#1890ff' : '#52c41a',
                            flexShrink: 0
                          }}
                        />
                      }
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong style={{ color: message.type === 'user' ? '#1890ff' : '#52c41a' }}>
                            {message.type === 'user' ? '您' : 'AI助手'}
                          </Text>
                          {/* 🔧 新增：显示RAG增强信息 */}
                          {message.type === 'ai' && (
                            <Space size={4}>
                              {message.ragEnhanced && (
                                <Tag color="green" style={{ fontSize: 10 }}>
                                  RAG增强 ({message.relevantChunks}个参考)
                                </Tag>
                              )}
                              {message.fallback && (
                                <Tag color="orange" style={{ fontSize: 10 }}>
                                  基础回答
                                </Tag>
                              )}
                            </Space>
                          )}
                        </div>
                      }                      description={
                        <div style={{ 
                          whiteSpace: 'pre-wrap', 
                          lineHeight: 1.6,
                          fontSize: isMobile ? 13 : 14,
                          marginTop: 8 
                        }}>
                          {message.content}
                        </div>
                      }
                    />
                  </div>
                </List.Item>
              )}
            />
          )}
          {isAiThinking && (
            <div style={{ 
              textAlign: 'center', 
              padding: '20px',
              background: '#fff',
              borderRadius: 6,
              margin: 8
            }}>
              <Spin /> <span style={{ marginLeft: '8px' }}>AI正在思考...</span>
            </div>
          )}
        </div>        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '8px' : '12px', 
          alignItems: 'flex-end',
          background: '#f8f9fa',
          padding: isMobile ? '12px' : '16px',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <TextArea
            value={currentQuestion}
            onChange={(e) => setCurrentQuestion(e.target.value)}            placeholder={isMobile ? "向AI助手提問..." : "向AI助手提問關於當前學習內容的任何問題... (按Enter發送，Shift+Enter換行)"}
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e) => {
              if (e.shiftKey) return;
              e.preventDefault();
              handleSendMessage();
            }}
            style={{ 
              fontSize: isMobile ? 13 : 14,
              borderRadius: '8px',
              resize: 'none'
            }}
          />
          <Button 
            type="primary" 
            onClick={handleSendMessage}
            loading={isAiThinking}
            disabled={!currentQuestion.trim()}
            style={{ 
              height: isMobile ? 40 : 46, 
              paddingLeft: isMobile ? 12 : 20, 
              paddingRight: isMobile ? 12 : 20,
              borderRadius: '8px',
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: 500
            }}
            icon={<MessageOutlined />}
          >
            {isMobile ? '' : '發送'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default LearningPage;
