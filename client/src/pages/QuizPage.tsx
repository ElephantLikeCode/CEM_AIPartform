import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Card, Button, Radio, message, Progress, Typography, Space, 
  Spin, Tag, Modal, List, Divider, Alert
} from 'antd';
import { 
  ClockCircleOutlined, CheckCircleOutlined, TrophyOutlined,
  QuestionCircleOutlined, LeftOutlined, RightOutlined,
  FlagOutlined, TagsOutlined, FileTextOutlined,
  CloseCircleOutlined, PlayCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAIModel } from '../contexts/AIModelContext';

const { Title, Text, Paragraph } = Typography;

interface Question {
  id: number;
  type: 'multiple_choice' | 'true_false';
  question: string;
  options: string[];
  isTagQuestion?: boolean;
  sourceFiles?: string[];
}

interface QuizResult {
  questionId: number;
  question: string;
  selectedAnswer: number | null;
  correctAnswer: number;
  correct: boolean;
  score: number;
  explanation: string;
  questionType: string;
  options: string[];
  isUnanswered: boolean;
  sourceFiles?: string[];
}

const QuizPage: React.FC = () => {
  const { t } = useTranslation();
  const { currentModel } = useAIModel(); // 🤖 获取当前AI模型
  const navigate = useNavigate();
  const location = useLocation();
  
  const [testType, setTestType] = useState<'tag' | 'file'>('file');
  const [sessionId, setSessionId] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [timeLeft, setTimeLeft] = useState(1800);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);  const [results, setResults] = useState<QuizResult[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [accuracy, setAccuracy] = useState(0);  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 🏆 新增：测试完成后的学习建议
  const [nextLearningRecommendation, setNextLearningRecommendation] = useState<{
    hasNext: boolean;
    nextFile?: {
      id: string;
      name: string;
      summary: string;
      stages: number;
      keyPoints: number;
      tags: any[];
    };
    progress?: {
      completed: number;
      total: number;
      percentage: number;
    };
    message?: string;
  } | null>(null);
  
  // 防止重复生成题目的标志
  const isGenerating = useRef(false);
  
  // 🔧 新增：答题进度保存相关状态
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const autoSaveInterval = useRef<NodeJS.Timeout | null>(null);
  
  // 🔧 新增：生成状态检查
  const [checkingGeneration, setCheckingGeneration] = useState(false);
  
  const [testInfo, setTestInfo] = useState<{
    name: string;
    type: 'tag_comprehensive' | 'comprehensive';
    difficulty: string;
    questionCount: number;
    fileCount?: number;
    isTagTest?: boolean;
  }>({
    name: '',
    type: 'comprehensive',
    difficulty: '中级',
    questionCount: 0,
    fileCount: 1,
    isTagTest: false
  });
  const getUrlParams = () => {
    const params = new URLSearchParams(location.search);
    return {
      userId: params.get('userId'),
      fileId: params.get('fileId'),
      fileName: params.get('fileName'),
      tagId: params.get('tagId'),
      tagName: params.get('tagName'),
      count: params.get('count'),
      testType: params.get('testType'),
      model: params.get('model') // 🤖 获取URL中的AI模型参数
    };
  };useEffect(() => {
    if (timeLeft > 0 && !quizCompleted && !loading) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !quizCompleted) {
      // 时间到时自动提交，避免依赖外部函数
      message.warning('時間到！自動提交測試');
      
      if (!sessionId) {
        message.error('会话信息丢失，请重新开始测试');
        return;
      }

      setSubmitting(true);
      
      const submissionAnswers = questions.map((question, index) => ({
        questionId: question.id,
        selectedAnswer: answers[index] !== null && answers[index] !== undefined ? 
          answers[index] : '未作答'
      }));

      axios.post('/api/quiz/submit', {
        sessionId,
        answers: submissionAnswers
      }).then(response => {
        if (response.data.success) {
          const { finalScore, accuracy, results, summary } = response.data.data;
          
          setResults(results || []);
          setFinalScore(finalScore || 0);
          setAccuracy(accuracy || 0);
          setQuizCompleted(true);
          
          console.log(`✅ ${summary?.testTypeName || '测试'}自动提交成功: 得分${finalScore}, 正确率${accuracy}%`);
          
          const testTypeName = testInfo.isTagTest ? '標籤綜合測試' : '文檔測試';
          message.success(`${testTypeName}自动提交成功！得分：${finalScore}分`);
        } else {
          throw new Error(response.data.message || '自动提交失败');
        }
      }).catch(error => {
        console.error('❌ 测试自动提交失败:', error);
        message.error('自动提交失败: ' + (error.response?.data?.message || error.message));
      }).finally(() => {
        setSubmitting(false);
      });
    }
  }, [timeLeft, quizCompleted, loading, sessionId, questions, answers, testInfo]);
  const generateQuestions = async () => {
    // 防止重复调用
    if (isGenerating.current) {
      console.log('🚫 题目生成已在进行中，跳过重复请求');
      return;
    }
    
    isGenerating.current = true;
    setGenerating(true);
    setError(null);
      try {      const params = getUrlParams();
      const { userId, fileId, fileName, tagId, tagName, count, testType, model } = params;

      // 🤖 优先使用URL参数中的模型，否则使用context中的模型
      const selectedModel = model || currentModel || 'local';
      
      console.log('🤖 AI模型选择:', {
        urlModel: model,
        contextModel: currentModel,
        selectedModel,
        timestamp: new Date().toISOString()
      });

      // 🔧 修复：如果 URL 中没有 testType，根据其他参数推断
      let actualTestType = testType;
      if (!actualTestType) {
        if (tagId) {
          actualTestType = 'tag';
        } else if (fileId) {
          actualTestType = 'file';
        } else {
          throw new Error('无法确定测试类型：缺少必要的参数');
        }
      }

      console.log('🔄 开始生成题目...', {
        testType: actualTestType,
        fileId,
        fileName,
        tagId,
        tagName,
        userId,
        count,
        selectedModel // 🤖 记录选择的模型
      });      const requestData: any = {
        userId: parseInt(userId || '1'), // 确保是数字
        count: parseInt(count || '8'), // 确保是数字
        difficulty: '中级',
        model: selectedModel // 🤖 使用选择的AI模型
      };

      if (actualTestType === 'tag') {
        if (!tagId) {
          throw new Error('标签ID不能为空');
        }
        requestData.type = 'tag';
        requestData.tagId = parseInt(tagId); // 确保是数字
        setTestType('tag');
      } else {
        if (!fileId) {
          throw new Error('文件ID不能为空');
        }
        requestData.type = 'file';
        requestData.fileId = fileId; // 保持为字符串
        setTestType('file');
      }

      console.log('📤 发送题目生成请求:', requestData);

      const response = await axios.post('/api/quiz/generate-questions', requestData);
      
      console.log('📥 题目生成响应:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.message || '题目生成失败');
      }

      const responseData = response.data.data;
      if (!responseData) {
        throw new Error('服务器响应数据为空');
      }

      if (!responseData.sessionId) {
        console.error('❌ 响应中缺少sessionId:', responseData);
        throw new Error('服务器响应中缺少会话ID');
      }

      if (!responseData.questions || !Array.isArray(responseData.questions)) {
        console.error('❌ 响应中缺少有效的题目数据:', responseData);
        throw new Error('服务器响应中缺少有效的题目数据');
      }

      if (responseData.questions.length === 0) {
        throw new Error('生成的题目数量为0');
      }      setQuestions(responseData.questions);
      setSessionId(responseData.sessionId);
      setTestInfo({
        name: actualTestType === 'tag' ? (tagName || '学习标签') : (fileName || '学习文件'),
        type: actualTestType === 'tag' ? 'tag_comprehensive' : 'comprehensive',
        difficulty: '中级',
        questionCount: responseData.questions.length,
        fileCount: actualTestType === 'tag' ? responseData.fileCount : 1,
        isTagTest: actualTestType === 'tag'
      });

      console.log(`✅ 题目生成成功: ${responseData.questions.length}道题目, 会话ID: ${responseData.sessionId}`);
      
      setLoading(false);
      
      message.success({
        content: `成功生成${responseData.questions.length}道${actualTestType === 'tag' ? '标签' : '文件'}测试题目！`,
        duration: 3
      });

    } catch (error: any) {
      console.error('❌ 题目生成失败:', error);
      
      let errorMessage = '题目生成失败';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (error.response?.data?.errors) {
        const validationErrors = error.response.data.errors;
        console.log('📋 参数验证错误详情:', validationErrors);
        errorMessage = `参数验证失败: ${validationErrors.join(', ')}`;
      }

      let suggestion = '请稍后重试';
      if (errorMessage.includes('内容不足')) {
        suggestion = '请确保学习材料包含足够的内容';
      } else if (errorMessage.includes('AI服务')) {
        suggestion = '请检查AI服务状态';
      } else if (errorMessage.includes('会话ID')) {
        suggestion = '请刷新页面重试';
      } else if (errorMessage.includes('参数')) {
        suggestion = '请检查请求参数格式';
      }

      setError(`${errorMessage}。${suggestion}`);
      
      message.error({
        content: errorMessage,
        duration: 5
      });    } finally {
      setGenerating(false);
      isGenerating.current = false; // 重置防重复标志
    }
  };  useEffect(() => {
    // 检查是否从QuizMenuPage传递了预生成的数据
    const navigationState = location.state as any;    if (navigationState?.sessionId && navigationState?.questions) {
      // 使用预生成的数据
      console.log('🔄 使用预生成的题目数据:', {
        sessionId: navigationState.sessionId,
        questionCount: navigationState.questions.length,
        testInfo: navigationState.testInfo
      });
      
      // 🔧 修复：设置 testType 状态
      const testInfoData = navigationState.testInfo || {
        name: '测试',
        type: 'comprehensive',
        difficulty: '中级',
        questionCount: navigationState.questions.length,
        fileCount: 1,
        isTagTest: false
      };
      
      // 根据测试信息设置 testType
      if (testInfoData.type === 'tag' || testInfoData.isTagTest) {
        setTestType('tag');
      } else {
        setTestType('file');
      }
      
      setQuestions(navigationState.questions);
      setSessionId(navigationState.sessionId);
      setTestInfo(testInfoData);
      
      // 🔧 新增：尝试恢复答题进度
      const restored = restoreQuizProgress(navigationState.sessionId);
      if (!restored) {
        // 没有保存的进度，使用默认状态
        setCurrentQuestionIndex(0);
        setAnswers({});
        setTimeLeft(1800);
      }
      
      setLoading(false);
      
      // 移除重复的成功提示，QuizMenuPage已经显示过了
      console.log(`✅ 测试准备完成：${navigationState.questions.length}道题目，类型：${testInfoData.type === 'tag' || testInfoData.isTagTest ? '标签' : '文件'}`);
    } else {
      // 没有预生成数据，检查URL参数
      const params = getUrlParams();
      const { fileId, tagId, testType } = params;
        if (!fileId && !tagId) {
        // 没有有效的参数，检查是否有正在进行的生成
        const params = getUrlParams();
        const userId = parseInt(params.userId || '1');
        
        // 🔧 新增：检查用户是否有正在进行的生成
        checkUserGenerationStatus(userId).then(hasActiveGeneration => {
          if (!hasActiveGeneration) {
            // 没有正在进行的生成，引导用户返回测验菜单
            setError('无效的测试链接。请从测验菜单页面选择要测试的内容。');
            setLoading(false);
            
            setTimeout(() => {
              message.warning('正在重定向到测验菜单...');
              navigate('/quiz-menu', { replace: true });
            }, 3000);
          }
        });
        
        return;
      }
      
      // 有URL参数，尝试生成题目
      generateQuestions();
    }
  }, []);
  const handleAnswerChange = (questionIndex: number, selectedAnswer: number) => {
    setAnswers(prev => {
      const newAnswers = {
        ...prev,
        [questionIndex]: selectedAnswer
      };
      
      // 🔧 新增：答案变更时自动保存进度
      if (autoSaveEnabled) {
        // 延迟保存，避免频繁操作
        setTimeout(() => {
          saveQuizProgress();
        }, 500);
      }
      
      return newAnswers;
    });
  };
  const handleSubmit = useCallback(async () => {
    if (!sessionId) {
      message.error('会话信息丢失，请重新开始测试');
      return;
    }

    const unansweredQuestions = questions
      .map((_, index) => index)
      .filter(index => answers[index] === null || answers[index] === undefined);

    if (unansweredQuestions.length > 0) {
      const proceed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '確認提交',
          content: `您還有 ${unansweredQuestions.length} 題未作答，確定要提交嗎？`,
          okText: '確定提交',
          cancelText: '繼續答題',
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        });
      });

      if (!proceed) return;
    }

    setSubmitting(true);
    try {
      const submissionAnswers = questions.map((question, index) => ({
        questionId: question.id,
        selectedAnswer: answers[index] !== null && answers[index] !== undefined ? 
          answers[index] : '未作答'
      }));

      console.log('📝 提交测试答案:', {
        sessionId,
        answerCount: submissionAnswers.length,
        testType: testInfo.type
      });

      const response = await axios.post('/api/quiz/submit', {
        sessionId,
        answers: submissionAnswers
      });      if (response.data.success) {
        const { finalScore, accuracy, results, summary } = response.data.data;
        
        setResults(results || []);
        setFinalScore(finalScore || 0);
        setAccuracy(accuracy || 0);
        setQuizCompleted(true);
        
        // 🔧 新增：提交成功后清理答题进度
        clearQuizProgress(sessionId);
        
        console.log(`✅ ${summary?.testTypeName || '测试'}提交成功: 得分${finalScore}, 正确率${accuracy}%`);
        
        const testTypeName = testInfo.isTagTest ? '標籤綜合測試' : '文檔測試';
        message.success(`${testTypeName}提交成功！得分：${finalScore}分`);
        
        // 🏆 新增：如果是文件测试，获取下一个学习建议
        if (!testInfo.isTagTest && finalScore >= 80) {
          await fetchNextLearningRecommendation(finalScore);
        }
      } else {
        throw new Error(response.data.message || '提交失败');
      }
    } catch (error: any) {
      console.error('❌ 测试提交失败:', error);
      message.error('提交失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, questions, answers, testInfo]);

  // 🏆 新增：获取下一个学习建议
  const fetchNextLearningRecommendation = useCallback(async (testScore: number) => {
    try {
      const params = getUrlParams();
      const { userId, fileId } = params;
      
      if (!fileId) {
        console.log('⚠️ 没有文件ID，跳过获取学习建议');
        return;
      }
      
      console.log('🔍 获取下一个学习建议:', { userId, fileId, testScore });
      
      const response = await axios.post('/api/learning/complete-test', {
        userId: parseInt(userId || '1'),
        fileId,
        testScore
      });
      
      if (response.data.success) {
        const data = response.data.data;
        
        setNextLearningRecommendation({
          hasNext: data.hasMoreFiles,
          nextFile: data.nextFile,
          progress: data.progress,
          message: data.message
        });
        
        console.log('✅ 学习建议获取成功:', data);
      }
    } catch (error: any) {
      console.error('❌ 获取学习建议失败:', error);
      // 静默失败，不影响测试结果显示
    }
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getProgressColor = () => {
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    if (progress < 30) return '#ff4d4f';
    if (progress < 70) return '#faad14';
    return '#52c41a';
  };  const renderResults = () => (
    <div style={{ 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      padding: '24px 0'
    }}>      <div style={{ 
        maxWidth: 1400, 
        margin: '0 auto', 
        padding: window.innerWidth <= 768 ? '0 16px' : '0 24px'
      }}>
        {/* 顶部成绩展示卡片 */}
        <Card 
          style={{ 
            marginBottom: 24, 
            textAlign: 'center',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)',
            overflow: 'hidden'
          }}
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <TrophyOutlined style={{ 
                fontSize: window.innerWidth <= 768 ? 60 : 80, 
                color: finalScore >= 80 ? '#52c41a' : finalScore >= 60 ? '#faad14' : '#ff4d4f',
                marginBottom: 16
              }} />
              <Title 
                level={window.innerWidth <= 768 ? 2 : 1} 
                style={{ 
                  margin: '16px 0 8px 0', 
                  color: '#1a1a1a',
                  fontSize: window.innerWidth <= 768 ? '24px' : undefined
                }}
              >
                {testInfo.isTagTest ? '標籤綜合測試' : '文檔測試'}完成！
              </Title>
              <div style={{ marginBottom: 24 }}>
                <Space wrap size={[8, 8]}>                  {testInfo.isTagTest ? (
                    <Tag className="material-title-tag" color="purple" icon={<TagsOutlined />} style={{ 
                      fontSize: window.innerWidth <= 768 ? 12 : 14, 
                      padding: window.innerWidth <= 768 ? '4px 8px' : '6px 12px' 
                    }}>
                      {testInfo.name}
                    </Tag>
                  ) : (
                    <Tag className="material-title-tag" color="blue" icon={<FileTextOutlined />} style={{ 
                      fontSize: window.innerWidth <= 768 ? 12 : 14, 
                      padding: window.innerWidth <= 768 ? '4px 8px' : '6px 12px' 
                    }}>
                      {testInfo.name}
                    </Tag>
                  )}
                  <Tag color="orange" style={{ 
                    fontSize: window.innerWidth <= 768 ? 12 : 14, 
                    padding: window.innerWidth <= 768 ? '4px 8px' : '6px 12px' 
                  }}>
                    {testInfo.difficulty}
                  </Tag>
                  {testInfo.isTagTest && testInfo.fileCount && (
                    <Tag color="cyan" style={{ 
                      fontSize: window.innerWidth <= 768 ? 12 : 14, 
                      padding: window.innerWidth <= 768 ? '4px 8px' : '6px 12px' 
                    }}>
                      {testInfo.fileCount}個文檔
                    </Tag>
                  )}
                </Space>
              </div>
            </div>
            
            {/* 分数统计 - 响应式优化 */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: window.innerWidth <= 768 ? 
                'repeat(auto-fit, minmax(150px, 1fr))' : 
                'repeat(auto-fit, minmax(200px, 1fr))',
              gap: window.innerWidth <= 768 ? 16 : 32,
              maxWidth: 800,
              margin: '0 auto',
              width: '100%'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                padding: window.innerWidth <= 768 ? '16px' : '24px',
                borderRadius: 12,
                color: 'white',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(79, 172, 254, 0.3)'
              }}>
                <Title level={1} style={{ 
                  margin: 0, 
                  color: 'white', 
                  fontSize: window.innerWidth <= 768 ? 32 : 48 
                }}>
                  {finalScore}
                </Title>
                <Text style={{ 
                  fontSize: window.innerWidth <= 768 ? 14 : 18, 
                  color: 'white', 
                  opacity: 0.9 
                }}>
                  總分
                </Text>
              </div>
              <div style={{
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                padding: window.innerWidth <= 768 ? '16px' : '24px',
                borderRadius: 12,
                color: 'white',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(67, 233, 123, 0.3)'
              }}>
                <Title level={1} style={{ 
                  margin: 0, 
                  color: 'white', 
                  fontSize: window.innerWidth <= 768 ? 32 : 48 
                }}>
                  {accuracy}%
                </Title>
                <Text style={{ 
                  fontSize: window.innerWidth <= 768 ? 14 : 18, 
                  color: 'white', 
                  opacity: 0.9 
                }}>
                  正確率
                </Text>
              </div>
              <div style={{
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                padding: window.innerWidth <= 768 ? '16px' : '24px',
                borderRadius: 12,
                color: 'white',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(250, 112, 154, 0.3)'
              }}>
                <Title level={1} style={{ 
                  margin: 0, 
                  color: 'white', 
                  fontSize: window.innerWidth <= 768 ? 32 : 48 
                }}>
                  {results.filter(r => r.correct).length}
                </Title>
                <Text style={{ 
                  fontSize: window.innerWidth <= 768 ? 14 : 18, 
                  color: 'white', 
                  opacity: 0.9 
                }}>
                  正確題數
                </Text>
              </div>
            </div>

            {/* 评价消息 */}
            <div style={{ 
              background: finalScore >= 80 ? 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)' : 
                         finalScore >= 60 ? 'linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%)' : 
                         'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)',
              padding: window.innerWidth <= 768 ? 16 : 24,
              borderRadius: 12,
              border: `2px solid ${finalScore >= 80 ? '#b7eb8f' : finalScore >= 60 ? '#ffd591' : '#ffccc7'}`,
              maxWidth: 600,
              margin: '0 auto',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <Text style={{ 
                color: finalScore >= 80 ? '#155724' : finalScore >= 60 ? '#856404' : '#721c24',
                fontSize: window.innerWidth <= 768 ? 16 : 18,
                fontWeight: 600,
                display: 'block',
                textAlign: 'center',
                lineHeight: 1.5
              }}>
                {finalScore >= 90 ? '🎉 優秀！您對內容掌握得非常好！' :
                 finalScore >= 80 ? '✨ 良好！您已經很好地理解了大部分內容' :
                 finalScore >= 60 ? '👍 及格！還有進步空間，建議複習重點內容' :
                 '💪 需要加強！建議重新學習相關內容'}
              </Text>
            </div>
          </Space>
        </Card>

        {/* 详细答题结果 - 响应式网格布局 */}
        <Card 
          title={
            <Title level={3} style={{ margin: 0, color: '#1a1a1a' }}>
              📋 詳細答題結果
            </Title>
          }
          style={{
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            background: 'white'
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: window.innerWidth <= 768 ? 
              '1fr' : 
              window.innerWidth <= 1200 ? 
                'repeat(auto-fit, minmax(400px, 1fr))' : 
                'repeat(auto-fill, minmax(500px, 1fr))',
            gap: window.innerWidth <= 768 ? 16 : 20,
            padding: '16px 0'
          }}>            {results.map((result, index) => (
              <div
                key={index}
                style={{ 
                  background: result.correct ? 
                    'linear-gradient(135deg, #f6ffed 0%, #e6f7ff 100%)' : 
                    'linear-gradient(135deg, #fff2f0 0%, #fff1f0 100%)',
                  padding: window.innerWidth <= 768 ? 16 : 20,
                  borderRadius: 12,
                  border: `2px solid ${result.correct ? '#87e8de' : '#ffadd6'}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  transition: 'transform 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (window.innerWidth > 768) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (window.innerWidth > 768) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                  }
                }}
              >
                {/* 题目头部信息 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: window.innerWidth <= 768 ? 'flex-start' : 'center',
                  flexDirection: window.innerWidth <= 768 ? 'column' : 'row',
                  gap: window.innerWidth <= 768 ? 12 : 0,
                  marginBottom: 16
                }}>
                  <Space wrap size={[6, 6]}>
                    <Tag 
                      color={result.correct ? 'success' : 'error'}
                      style={{ 
                        fontSize: window.innerWidth <= 768 ? 11 : 12, 
                        padding: window.innerWidth <= 768 ? '3px 6px' : '4px 8px', 
                        fontWeight: 600 
                      }}
                    >
                      題目 {index + 1}
                    </Tag>
                    <Tag color="geekblue" style={{ 
                      fontSize: window.innerWidth <= 768 ? 11 : 12, 
                      padding: window.innerWidth <= 768 ? '3px 6px' : '4px 8px' 
                    }}>
                      {result.questionType === 'multiple_choice' ? '選擇題' : '判斷題'}
                    </Tag>
                    {result.isUnanswered && (
                      <Tag color="orange" style={{ 
                        fontSize: window.innerWidth <= 768 ? 11 : 12, 
                        padding: window.innerWidth <= 768 ? '3px 6px' : '4px 8px' 
                      }}>
                        未作答
                      </Tag>
                    )}
                  </Space>
                  <div style={{
                    background: result.correct ? '#52c41a' : '#ff4d4f',
                    color: 'white',
                    padding: window.innerWidth <= 768 ? '5px 10px' : '6px 12px',
                    borderRadius: 20,
                    fontSize: window.innerWidth <= 768 ? 13 : 14,
                    fontWeight: 600,
                    alignSelf: window.innerWidth <= 768 ? 'flex-start' : 'auto'
                  }}>
                    {result.score}分
                  </div>
                </div>
                
                {/* 题目内容 */}
                <div style={{
                  background: 'rgba(255,255,255,0.8)',
                  padding: window.innerWidth <= 768 ? 12 : 16,
                  borderRadius: 8,
                  marginBottom: 16,
                  border: '1px solid rgba(0,0,0,0.06)'
                }}>
                  <Paragraph 
                    strong 
                    style={{ 
                      fontSize: window.innerWidth <= 768 ? 14 : 15, 
                      marginBottom: 16,
                      color: '#1a1a1a',
                      lineHeight: 1.6
                    }}
                  >
                    {result.question}
                  </Paragraph>
                  
                  {/* 选项列表 */}
                  <div style={{ marginBottom: 0 }}>
                    {result.options.map((option, optionIndex) => (
                      <div 
                        key={optionIndex}
                        style={{
                          padding: window.innerWidth <= 768 ? '8px 10px' : '10px 14px',
                          margin: '6px 0',
                          borderRadius: 8,
                          background: 
                            optionIndex === result.correctAnswer ? 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)' :
                            optionIndex === result.selectedAnswer && !result.correct ? 'linear-gradient(135deg, #fff1f0 0%, #fff2f0 100%)' :
                            'rgba(248,249,250,0.8)',
                          border: 
                            optionIndex === result.correctAnswer ? '2px solid #87e8de' :
                            optionIndex === result.selectedAnswer && !result.correct ? '2px solid #ffadd6' :
                            '1px solid rgba(0,0,0,0.06)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Space align="start" size={window.innerWidth <= 768 ? 6 : 8}>
                          {optionIndex === result.correctAnswer && (
                            <CheckCircleOutlined style={{ 
                              color: '#52c41a', 
                              fontSize: window.innerWidth <= 768 ? 14 : 16, 
                              marginTop: 2 
                            }} />
                          )}
                          {optionIndex === result.selectedAnswer && !result.correct && (
                            <CloseCircleOutlined style={{ 
                              color: '#ff4d4f', 
                              fontSize: window.innerWidth <= 768 ? 14 : 16, 
                              marginTop: 2 
                            }} />
                          )}
                          <Text 
                            strong={optionIndex === result.correctAnswer || optionIndex === result.selectedAnswer}
                            style={{ 
                              color: 
                                optionIndex === result.correctAnswer ? '#1890ff' :
                                optionIndex === result.selectedAnswer && !result.correct ? '#ff4d4f' :
                                '#333',
                              fontSize: window.innerWidth <= 768 ? 13 : 14,
                              lineHeight: 1.5,
                              flex: 1
                            }}
                          >
                            <span style={{ 
                              background: optionIndex === result.correctAnswer ? '#52c41a' : 
                                         optionIndex === result.selectedAnswer && !result.correct ? '#ff4d4f' : '#999',
                              color: 'white',
                              padding: window.innerWidth <= 768 ? '1px 4px' : '2px 6px',
                              borderRadius: 4,
                              fontSize: window.innerWidth <= 768 ? 11 : 12,
                              marginRight: window.innerWidth <= 768 ? 6 : 8,
                              fontWeight: 600,
                              display: 'inline-block',
                              minWidth: window.innerWidth <= 768 ? 18 : 20,
                              textAlign: 'center'
                            }}>
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            {option}
                          </Text>
                        </Space>
                      </div>
                    ))}
                  </div>
                </div>                
                {/* 解析部分 */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)',
                  padding: window.innerWidth <= 768 ? 12 : 14,
                  borderRadius: 8,
                  border: '1px solid #b3d8ff'
                }}>
                  <Text style={{ 
                    color: '#1890ff', 
                    fontSize: window.innerWidth <= 768 ? 12 : 13,
                    lineHeight: 1.5,
                    display: 'block'
                  }}>
                    <span style={{ fontWeight: 600 }}>💡 解析：</span>
                    {result.explanation}
                  </Text>
                </div>

                {/* 来源信息 */}
                {result.sourceFiles && result.sourceFiles.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Tag color="cyan" style={{ 
                      fontSize: window.innerWidth <= 768 ? 10 : 11,
                      padding: window.innerWidth <= 768 ? '2px 6px' : '4px 8px'
                    }}>
                      📁 來源: {result.sourceFiles.join(', ')}
                    </Tag>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>        {/* 底部操作按钮 */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: 32,
          padding: window.innerWidth <= 768 ? '16px 0' : '24px 0'
        }}>
          {/* 🏆 新增：学习建议显示 */}
          {nextLearningRecommendation && (
            <Card 
              style={{ 
                marginBottom: 24,
                background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)',
                border: '1px solid #91d5ff'
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <Text style={{ 
                  fontSize: 16, 
                  fontWeight: 600, 
                  color: '#1890ff',
                  display: 'block',
                  marginBottom: 12
                }}>
                  🎯 学习建议
                </Text>
                
                <Paragraph style={{ marginBottom: 16, color: '#666' }}>
                  {nextLearningRecommendation.message}
                </Paragraph>
                
                {nextLearningRecommendation.nextFile && (
                  <div style={{ 
                    background: 'white', 
                    padding: 16, 
                    borderRadius: 8,
                    marginBottom: 16,
                    border: '1px solid #e6f7ff'
                  }}>
                    <Text strong style={{ color: '#1890ff', display: 'block', marginBottom: 8 }}>
                      📚 建议学习：{nextLearningRecommendation.nextFile.name}
                    </Text>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      {nextLearningRecommendation.nextFile.summary}
                    </Text>
                    <Space wrap>
                      <Tag color="blue">{nextLearningRecommendation.nextFile.stages} 个阶段</Tag>
                      <Tag color="green">{nextLearningRecommendation.nextFile.keyPoints} 个要点</Tag>
                      {nextLearningRecommendation.nextFile.tags.map((tag: any) => (
                        <Tag key={tag.id} color={tag.color}>{tag.name}</Tag>
                      ))}
                    </Space>
                  </div>
                )}
                
                {nextLearningRecommendation.progress && (
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      学习进度：{nextLearningRecommendation.progress.completed}/{nextLearningRecommendation.progress.total} 
                      ({nextLearningRecommendation.progress.percentage}%)
                    </Text>
                    <Progress 
                      percent={nextLearningRecommendation.progress.percentage} 
                      size="small" 
                      style={{ marginTop: 4 }}
                    />
                  </div>
                )}
              </div>
            </Card>
          )}
          
          <Space 
            size={window.innerWidth <= 768 ? 'middle' : 'large'}
            direction={window.innerWidth <= 768 ? 'vertical' : 'horizontal'}
            style={{ width: window.innerWidth <= 768 ? '100%' : 'auto' }}
          >
            {/* 🏆 条件显示：如果有下一个学习文件，优先显示继续学习按钮 */}
            {nextLearningRecommendation?.hasNext ? (
              <Button 
                type="primary"
                size={window.innerWidth <= 768 ? 'middle' : 'large'}
                onClick={() => {
                  // 跳转到学习页面，并传递下一个文件信息
                  navigate('/learning', {
                    state: {
                      recommendedFileId: nextLearningRecommendation.nextFile?.id,
                      fromQuiz: true
                    }
                  });
                }}
                style={{
                  height: window.innerWidth <= 768 ? 40 : 48,
                  padding: window.innerWidth <= 768 ? '0 24px' : '0 32px',
                  borderRadius: window.innerWidth <= 768 ? 20 : 24,
                  fontSize: window.innerWidth <= 768 ? 14 : 16,
                  background: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)',
                  border: 'none',
                  boxShadow: '0 4px 15px rgba(82, 196, 26, 0.4)',
                  width: window.innerWidth <= 768 ? '100%' : 'auto',
                  maxWidth: window.innerWidth <= 768 ? 280 : 'none'
                }}
              >
                � 继续学习下一个文件
              </Button>
            ) : (
              <Button 
                type="primary" 
                size={window.innerWidth <= 768 ? 'middle' : 'large'}
                onClick={() => navigate('/learning')}
                style={{
                  height: window.innerWidth <= 768 ? 40 : 48,
                  padding: window.innerWidth <= 768 ? '0 24px' : '0 32px',
                  borderRadius: window.innerWidth <= 768 ? 20 : 24,
                  fontSize: window.innerWidth <= 768 ? 14 : 16,
                  background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                  border: 'none',
                  boxShadow: '0 4px 15px rgba(79, 172, 254, 0.4)',
                  width: window.innerWidth <= 768 ? '100%' : 'auto',
                  maxWidth: window.innerWidth <= 768 ? 280 : 'none'
                }}
              >
                📚 返回学习页面
              </Button>
            )}
            
            <Button 
              size={window.innerWidth <= 768 ? 'middle' : 'large'}
              onClick={() => navigate('/quiz-menu')}
              style={{
                height: window.innerWidth <= 768 ? 40 : 48,
                padding: window.innerWidth <= 768 ? '0 24px' : '0 32px',
                borderRadius: window.innerWidth <= 768 ? 20 : 24,
                fontSize: window.innerWidth <= 768 ? 14 : 16,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                color: 'white',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                width: window.innerWidth <= 768 ? '100%' : 'auto',
                maxWidth: window.innerWidth <= 768 ? 280 : 'none'
              }}
            >
              🔄 重新测试
            </Button>
          </Space>
        </div>
      </div>
    </div>  );

  // 🔧 新增：答题进度保存功能
  const saveQuizProgress = useCallback(async () => {
    if (!sessionId || !questions.length) return;
    
    try {
      const progressData = {
        sessionId,
        currentQuestionIndex,
        answers,
        timeLeft,
        testInfo,
        lastSaveTime: new Date().toISOString()
      };
      
      // 保存到 localStorage
      localStorage.setItem(`quiz_progress_${sessionId}`, JSON.stringify(progressData));
      setLastSaveTime(new Date());
      
      console.log('📝 答题进度已保存:', {
        sessionId,
        currentQuestion: currentQuestionIndex + 1,
        answeredCount: Object.keys(answers).length,
        timeLeft
      });
    } catch (error) {
      console.error('❌ 保存答题进度失败:', error);
    }
  }, [sessionId, currentQuestionIndex, answers, timeLeft, testInfo, questions.length]);

  // 🔧 新增：恢复答题进度
  const restoreQuizProgress = useCallback((sessionId: string) => {
    try {
      const savedProgress = localStorage.getItem(`quiz_progress_${sessionId}`);
      if (!savedProgress) return false;
      
      const progressData = JSON.parse(savedProgress);
      
      // 验证数据有效性
      if (progressData.sessionId !== sessionId) {
        console.warn('⚠️ 会话ID不匹配，跳过恢复');
        return false;
      }
      
      // 恢复状态
      setCurrentQuestionIndex(progressData.currentQuestionIndex || 0);
      setAnswers(progressData.answers || {});
      setTimeLeft(progressData.timeLeft || 1800);
      setTestInfo(progressData.testInfo || testInfo);
      setLastSaveTime(new Date(progressData.lastSaveTime));
      
      console.log('🔄 答题进度已恢复:', {
        sessionId,
        currentQuestion: (progressData.currentQuestionIndex || 0) + 1,
        answeredCount: Object.keys(progressData.answers || {}).length,
        timeLeft: progressData.timeLeft || 1800,
        saveTime: progressData.lastSaveTime
      });
      
      message.success('已恢復上次的答題進度');
      return true;
    } catch (error) {
      console.error('❌ 恢复答题进度失败:', error);
      return false;
    }
  }, [testInfo]);

  // 🔧 新增：清理答题进度
  const clearQuizProgress = useCallback((sessionId: string) => {
    try {
      localStorage.removeItem(`quiz_progress_${sessionId}`);
      console.log('🧹 答题进度已清理:', sessionId);
    } catch (error) {
      console.error('❌ 清理答题进度失败:', error);
    }
  }, []);

  // 🔧 新增：检查用户生成状态
  const checkUserGenerationStatus = useCallback(async (userId: number) => {
    try {
      setCheckingGeneration(true);
      const response = await axios.get(`/api/quiz/generation-status/${userId}`);
      
      if (response.data.success && response.data.data.isGenerating) {
        const generationInfo = response.data.data;
        console.log('🔄 发现正在进行的题目生成:', generationInfo);
        
        setGenerating(true);
        setError(null);
        
        // 显示生成状态
        message.info(`正在生成${generationInfo.type === 'tag' ? '标签' : '文件'}测试题目，请稍等...`);
        
        // 开始轮询生成状态
        pollGenerationStatus(userId);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ 检查生成状态失败:', error);
      return false;
    } finally {
      setCheckingGeneration(false);
    }
  }, []);

  // 🔧 新增：轮询生成状态
  const pollGenerationStatus = useCallback(async (userId: number) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/quiz/generation-status/${userId}`);
        
        if (response.data.success) {
          if (!response.data.data.isGenerating) {
            // 生成完成，停止轮询
            clearInterval(pollInterval);
            setGenerating(false);
            
            // 尝试刷新页面或重新获取题目
            message.success('题目生成完成！正在加载测试...');
            
            // 这里可以尝试重新生成题目或刷新页面
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      } catch (error) {
        console.error('❌ 轮询生成状态失败:', error);
        clearInterval(pollInterval);
        setGenerating(false);
      }
    }, 2000); // 每2秒检查一次
    
    // 设置最大轮询时间（5分钟）
    setTimeout(() => {
      clearInterval(pollInterval);
      if (generating) {
        setGenerating(false);
        setError('题目生成超时，请刷新页面重试');
      }
    }, 300000);
  }, [generating]);

  // 🔧 新增：定期自动保存答题进度
  useEffect(() => {
    if (!autoSaveEnabled || !sessionId || !questions.length) return;
    
    // 设置自动保存间隔（每30秒）
    autoSaveInterval.current = setInterval(() => {
      saveQuizProgress();
    }, 30000);
    
    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current);
        autoSaveInterval.current = null;
      }
    };
  }, [autoSaveEnabled, sessionId, questions.length, saveQuizProgress]);

  // 🔧 新增：页面卸载时保存进度
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionId && questions.length && !quizCompleted) {
        saveQuizProgress();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 组件卸载时也保存进度
      if (sessionId && questions.length && !quizCompleted) {
        saveQuizProgress();
      }
    };
  }, [sessionId, questions.length, quizCompleted, saveQuizProgress]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '60vh',
        flexDirection: 'column'
      }}>
        <Spin size="large" />
        <Text style={{ marginTop: 16, fontSize: 16 }}>
          正在生成測試題目，請稍候...
        </Text>
        <Text type="secondary" style={{ marginTop: 8 }}>
          {testType === 'tag' ? '🏷️ 標籤綜合測試生成中' : '📖 文檔測試生成中'}
        </Text>
      </div>
    );
  }

  if (questions.length === 0 && !generating) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Title level={2} style={{ color: '#1890ff', marginBottom: 16 }}>
              🎯 {testType === 'tag' ? '标签综合测试' : '文档学习测试'}
            </Title>
            
            <div style={{ marginBottom: 24 }}>              <Paragraph style={{ fontSize: 16, color: '#666' }}>
                {testType === 'tag' ? (
                  <>准备开始 <Text className="material-title-text" strong style={{ color: '#722ed1' }}>{testInfo.name}</Text> 的综合测试</>
                ) : (
                  <>准备开始 <Text className="material-title-text" strong style={{ color: '#1890ff' }}>{testInfo.name}</Text> 的学习测试</>
                )}
              </Paragraph>
              <Paragraph style={{ fontSize: 14, color: '#999' }}>
                将生成 {testInfo.questionCount} 道题目，包含选择题和判断题
              </Paragraph>
            </div>            {error && (
              <div style={{ marginBottom: 24 }}>
                <Alert
                  message="题目生成失败"
                  description={error}
                  type="error"
                  showIcon
                  style={{ textAlign: 'left' }}
                  action={
                    <Space>
                      {error.includes('无效的测试链接') ? (
                        <Button size="small" onClick={() => navigate('/quiz-menu')}>
                          返回测验菜单
                        </Button>
                      ) : (
                        <Button size="small" onClick={generateQuestions}>
                          重试
                        </Button>
                      )}
                    </Space>
                  }
                />
              </div>
            )}

            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={generateQuestions}
              loading={generating}
              disabled={generating}
              style={{
                height: 48,
                paddingLeft: 32,
                paddingRight: 32,
                fontSize: 16
              }}
            >
              {generating ? '正在生成题目...' : '开始生成测试题目'}
            </Button>

            {generating && (
              <div style={{ marginTop: 24 }}>
                <Spin />
                <Paragraph style={{ marginTop: 16, color: '#666' }}>
                  AI正在分析学习内容并生成题目，请稍候...
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    这可能需要10-30秒的时间
                  </Text>
                </Paragraph>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (quizCompleted) {
    return renderResults();
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const answeredCount = Object.values(answers).filter(answer => answer !== null && answer !== undefined).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Space>
              {testInfo.isTagTest ? (
                <Tag color="purple" icon={<TagsOutlined />}>
                  標籤綜合測試
                </Tag>
              ) : (
                <Tag color="blue" icon={<FileTextOutlined />}>
                  文檔測試
                </Tag>
              )}              <Text className="material-title-text" strong style={{ fontSize: 16 }}>
                {testInfo.name}
              </Text>
              <Tag color="orange">{testInfo.difficulty}</Tag>
              {testInfo.isTagTest && testInfo.fileCount && (
                <Tag color="cyan">{testInfo.fileCount}個文檔</Tag>
              )}
            </Space>
          </div>
          <Space>
            <Tag color="red" icon={<ClockCircleOutlined />}>
              {formatTime(timeLeft)}
            </Tag>
            <Tag color="blue">
              {answeredCount} / {questions.length} 已答
            </Tag>
          </Space>
        </div>
        
        <div style={{ marginTop: 16 }}>
          <Progress 
            percent={progress} 
            strokeColor={getProgressColor()}
            format={() => `${currentQuestionIndex + 1} / ${questions.length}`}
          />
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <Space style={{ marginBottom: 16 }}>
            <Tag color="blue">
              題目 {currentQuestionIndex + 1}
            </Tag>
            <Tag color="green">
              {currentQuestion.type === 'multiple_choice' ? '選擇題' : '判斷題'}
            </Tag>
            {currentQuestion.sourceFiles && currentQuestion.sourceFiles.length > 0 && (
              <Tag color="cyan" style={{ fontSize: 11 }}>
                來源: {currentQuestion.sourceFiles.join(', ')}
              </Tag>
            )}
            {currentQuestion.isTagQuestion && (
              <Tag color="purple" style={{ fontSize: 11 }}>
                跨文檔整合題
              </Tag>
            )}
          </Space>
          
          <Title level={4} style={{ marginBottom: 20, lineHeight: 1.6 }}>
            {currentQuestion.question}
          </Title>
          
          <Radio.Group
            value={answers[currentQuestionIndex]}
            onChange={(e) => handleAnswerChange(currentQuestionIndex, e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {currentQuestion.options.map((option, index) => (
                <Radio 
                  key={index} 
                  value={index}
                  style={{ 
                    padding: '12px 16px',
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    marginBottom: 8,
                    width: '100%',
                    backgroundColor: answers[currentQuestionIndex] === index ? '#f0f9ff' : '#fafafa'
                  }}
                >
                  <Text style={{ fontSize: 15, marginLeft: 8 }}>
                    {String.fromCharCode(65 + index)}. {option}
                  </Text>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            icon={<LeftOutlined />}
            disabled={currentQuestionIndex === 0}
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
          >
            上一題
          </Button>
          
          <Space>
            <Text type="secondary">
              進度: {Math.round(progress)}%
            </Text>
            {answeredCount < questions.length && (
              <Text type="warning">
                還有 {questions.length - answeredCount} 題未答
              </Text>
            )}
          </Space>
          
          {currentQuestionIndex === questions.length - 1 ? (
            <Button 
              type="primary" 
              icon={<FlagOutlined />}
              onClick={handleSubmit}
              loading={submitting}
            >
              提交測試
            </Button>
          ) : (
            <Button 
              type="primary"
              icon={<RightOutlined />}
              onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
            >
              下一題
            </Button>
          )}
        </div>
      </Card>

      <Card style={{ marginTop: 16 }} title="快速導航">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
          {questions.map((_, index) => (
            <Button
              key={index}
              size="small"
              type={currentQuestionIndex === index ? 'primary' : 'default'}
              style={{
                backgroundColor: 
                  currentQuestionIndex === index ? '#1890ff' :
                  answers[index] !== null && answers[index] !== undefined ? '#52c41a' : 
                  '#f0f0f0',
                color:
                  currentQuestionIndex === index ? '#fff' :
                  answers[index] !== null && answers[index] !== undefined ? '#fff' : 
                  '#666',
                border: 'none'
              }}
              onClick={() => setCurrentQuestionIndex(index)}
            >
              {index + 1}
            </Button>
          ))}
        </div>
        
        <Divider />
        
        <div style={{ textAlign: 'center' }}>
          <Space>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ 
                width: 16, 
                height: 16, 
                backgroundColor: '#1890ff', 
                marginRight: 8,
                borderRadius: 2
              }} />
              <Text style={{ fontSize: 12 }}>當前題目</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ 
                width: 16, 
                height: 16, 
                backgroundColor: '#52c41a', 
                marginRight: 8,
                borderRadius: 2
              }} />
              <Text style={{ fontSize: 12 }}>已作答</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ 
                width: 16, 
                height: 16, 
                backgroundColor: '#f0f0f0', 
                marginRight: 8,
                borderRadius: 2
              }} />
              <Text style={{ fontSize: 12 }}>未作答</Text>
            </div>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default QuizPage;
