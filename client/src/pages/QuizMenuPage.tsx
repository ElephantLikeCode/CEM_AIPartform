import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Space, Row, Col, message, Tabs, Tag, Spin, Empty, Select, InputNumber } from 'antd';
import { BookOutlined, TagOutlined, PlayCircleOutlined, ClockCircleOutlined, TrophyOutlined, FileTextOutlined, TagsOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useGeneration } from '../contexts/GenerationContext';
import { useAIModel } from '../contexts/AIModelContext';

const { Title, Text, Paragraph } = Typography;

// 修复材料接口定义
interface Material {
  id: string | number;
  name: string;
  type: 'file' | 'tag';
  summary?: string;
  stages?: number;
  keyPoints?: number;
  difficulty?: string;
  estimatedTime?: string;
  fileType?: string;
  uploadTime?: string;
  contentLength?: number;
  description?: string;
  color?: string;
  fileCount?: number;
  hasLearningContent?: boolean;
  topics?: string[];
  createdAt?: string;
}

// 修复材料响应接口
interface MaterialsResponse {
  success: boolean;
  data: {
    files: Material[];
    tags: Material[];
  };
  total: number;
  message: string;
}

const QuizMenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentModel } = useAIModel();
  const { startGeneration, stopGeneration, isGenerationLocked, generationState } = useGeneration();
  
  const [materials, setMaterials] = useState<{ files: Material[]; tags: Material[] }>({ files: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('files');
  const [selectedMaterial, setSelectedMaterial] = useState<string | number>('');
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [generating, setGenerating] = useState(false);

  // 从 localStorage 获取用户ID
  const userId = Number(localStorage.getItem('userId'));

  // 检查特定材料是否正在生成
  const isMaterialGenerating = (materialId: string | number, materialType: 'file' | 'tag') => {
    return generationState.isGenerating && 
           generationState.generationInfo?.materialId === materialId &&
           generationState.generationInfo?.materialType === materialType;
  };

  useEffect(() => {
    fetchMaterials();
  }, []);
  const fetchMaterials = async () => {
    try {
      setLoading(true);
      // Fetching quiz materials
      
      const response = await axios.get<MaterialsResponse>('/api/quiz/materials');
      // Materials data response received
      
      if (response.data.success) {
        // 🔧 修复：确保正确解析数据结构
        const materialsData = response.data.data || { files: [], tags: [] };
        
        setMaterials({
          files: Array.isArray(materialsData.files) ? materialsData.files : [],
          tags: Array.isArray(materialsData.tags) ? materialsData.tags : []
        });
          // Materials data loaded successfully
        
        // 如果有标签材料但没有文件材料，默认切换到标签选项卡
        if (materialsData.tags?.length > 0 && (!materialsData.files || materialsData.files.length === 0)) {
          setActiveTab('tags');
        }
      } else {
        throw new Error(response.data.message || '获取材料失败');
      }
    } catch (error: any) {
      console.error('❌ 获取测试材料失败:', error);
      message.error('获取测试材料失败: ' + (error.response?.data?.message || error.message));
      
      // 设置空数据防止错误
      setMaterials({ files: [], tags: [] });
    } finally {      setLoading(false);
    }
  };

  const handleStartFileTest = async (material: Material) => {
    if (!material.id) {
      message.error('材料ID不存在');
      return;
    }

    // 🔧 防止重复点击
    if (generating || isGenerationLocked()) {
      message.warning('已有题目生成在进行中，请等待完成');
      return;
    }

    setGenerating(true);
    
    // 🔧 新增：启动生成锁定，绑定到特定材料
    startGeneration('file', {
      name: material.name,
      userId: userId,
      materialId: material.id, // 绑定材料ID
      materialType: 'file'
    });
    
    try {
      // Starting file quiz

      // 🔧 修复：使用统一的 generate-questions 端点
      const requestData = {
        userId: userId,
        type: 'file', // 🔧 修复：明确指定类型
        fileId: material.id, // 保持为字符串
        count: questionCount,
        difficulty: material.difficulty || '中级',
        selectedModel: currentModel // 新增：传递AI模型
      };
      
      // Sending file quiz request
      const response = await axios.post('/api/quiz/generate-questions', requestData);

      // File quiz response received
      if (response.data.success) {
        // 🔧 修复：正确处理响应数据结构
        const responseData = response.data.data;
        
        // 🔧 停止生成状态
        stopGeneration();
        
        navigate('/quiz', {
          state: {
            sessionId: responseData.sessionId,
            questions: responseData.questions,
            testInfo: {
              type: 'file',
              name: material.name,
              difficulty: material.difficulty,
              questionCount: responseData.questionCount || responseData.questions?.length,              isTagTest: false  // 🔧 修复：添加文件测试标识
            }
          }
        });
      } else {
        throw new Error(response.data.message || '生成测试失败');
      }
    } catch (error: any) {
      console.error('❌ 开始文件测试失败:', error);
      
      // 🔧 确保在错误时停止生成状态
      stopGeneration();
      
      // 更详细的错误处理
      let errorMessage = '开始测试失败';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
        // 🔧 修复：处理参数验证错误
      if (error.response?.data?.errors) {
        const validationErrors = error.response.data.errors;
        console.log('📋 文件测试参数验证错误:', validationErrors);
        errorMessage = `参数验证失败: ${validationErrors.join(', ')}`;
      }
      
      // 🔧 新增：处理正在进行的生成错误
      if (error.response?.status === 409 && error.response?.data?.code === 'GENERATION_IN_PROGRESS') {
        const activeGeneration = error.response.data.data?.activeGeneration;
        if (activeGeneration) {
          message.warning({
            content: '您已有正在进行的题目生成，正在跳转到测试页面...',
            duration: 3
          });
          
          // 跳转到测试页面，让用户继续当前的生成过程
          setTimeout(() => {
            navigate('/quiz');
          }, 1000);
          
          return;
        }
      }
      
      // 显示更友好的错误信息
      if (errorMessage.includes('参数')) {
        errorMessage = '测试参数有误，请重新选择材料';
      } else if (errorMessage.includes('正在进行')) {
        errorMessage = '您已有正在进行的题目生成，请等待完成';
      } else if (errorMessage.includes('AI服务')) {
        errorMessage = 'AI服务暂时不可用，请稍后重试';
      } else if (errorMessage.includes('不存在')) {
        errorMessage = '选择的材料不存在，请刷新页面后重试';
      }
        message.error(errorMessage);
    } finally {
      setGenerating(false);
      // 🔧 确保在finally中也停止生成状态
      stopGeneration();
    }
  };

  const handleStartTagTest = async (material: Material) => {
    if (!material.id) {
      message.error('材料ID不存在');
      return;
    }

    // 🔧 防止重复点击
    if (generating || isGenerationLocked()) {
      message.warning('已有题目生成在进行中，请等待完成');
      return;
    }

    setGenerating(true);
    
    // 🔧 新增：启动生成锁定，绑定到特定材料
    startGeneration('tag', {
      name: material.name,
      userId: userId,
      materialId: material.id, // 绑定材料ID
      materialType: 'tag'
    });
    try {
      // Starting tag quiz

      // 🔧 修复：使用统一的 generate-questions 端点
      const requestData = {
        userId: userId,
        type: 'tag', // 🔧 修复：明确指定类型
        tagId: parseInt(material.id.toString()), // 🔧 修复：确保是数字
        count: questionCount,
        difficulty: material.difficulty || '中级',
        selectedModel: currentModel // 新增：传递AI模型
      };
      
      // Sending tag quiz request
      const response = await axios.post('/api/quiz/generate-questions', requestData);

      // Tag quiz response received
      if (response.data.success) {
        // 🔧 修复：正确处理标签测试响应的数据结构
        const responseData = response.data.data;
        
        // 🔧 停止生成状态
        stopGeneration();
        
        navigate('/quiz', {
          state: {
            sessionId: responseData.sessionId,
            questions: responseData.questions,
            testInfo: {
              type: 'tag',
              name: material.name,
              difficulty: material.difficulty,              questionCount: responseData.questionCount || responseData.questions?.length,
              fileCount: material.fileCount,
              isTagTest: true  // 🔧 修复：添加标签测试标识
            }
          }
        });
      } else {
        throw new Error(response.data.message || '生成测试失败');
      }
    } catch (error: any) {
      console.error('❌ 开始标签测试失败:', error);
      
      // 🔧 确保在错误时停止生成状态
      stopGeneration();
      
      // 更详细的错误处理
      let errorMessage = '开始测试失败';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
        // 🔧 修复：处理参数验证错误
      if (error.response?.data?.errors) {
        const validationErrors = error.response.data.errors;
        console.log('📋 标签测试参数验证错误:', validationErrors);
        errorMessage = `参数验证失败: ${validationErrors.join(', ')}`;
      }
      
      // 🔧 新增：处理正在进行的生成错误
      if (error.response?.status === 409 && error.response?.data?.code === 'GENERATION_IN_PROGRESS') {
        const activeGeneration = error.response.data.data?.activeGeneration;
        if (activeGeneration) {
          message.warning({
            content: '您已有正在进行的题目生成，正在跳转到测试页面...',
            duration: 3
          });
          
          // 跳转到测试页面，让用户继续当前的生成过程
          setTimeout(() => {
            navigate('/quiz');
          }, 1000);
          
          return;
        }
      }
      
      // 显示更友好的错误信息
      if (errorMessage.includes('参数')) {
        errorMessage = '测试参数有误，请重新选择标签';
      } else if (errorMessage.includes('正在进行')) {
        errorMessage = '您已有正在进行的题目生成，请等待完成';
      } else if (errorMessage.includes('学习内容')) {
        errorMessage = '该标签还没有生成学习内容，请先完成学习';
      } else if (errorMessage.includes('AI服务')) {
        errorMessage = 'AI服务暂时不可用，请稍后重试';
      } else if (errorMessage.includes('不存在')) {
        errorMessage = '选择的标签不存在，请刷新页面后重试';
      }
        message.error(errorMessage);
    } finally {
      setGenerating(false);
      // 🔧 确保在finally中也停止生成状态
      stopGeneration();
    }
  };

  const handleStartTest = (material: Material) => {
    if (material.type === 'tag') {
      handleStartTagTest(material);
    } else {
      handleStartFileTest(material);
    }
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case '初级': return 'green';
      case '中级': return 'orange';
      case '高级': return 'red';
      default: return 'blue';
    }
  };

  const getRecommendedQuestionCount = (material: Material) => {
    if (material.type === 'tag') {
      return Math.min(15, Math.max(8, (material.fileCount || 1) * 3));
    } else {
      return Math.min(12, Math.max(5, (material.stages || 1) * 2));
    }
  };

  const renderMaterialCard = (material: Material) => (
    <Card
      key={material.id}
      hoverable
      className="material-card"
      style={{ marginBottom: 16, height: '100%' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      <div style={{ flex: 1 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Space>
              {material.type === 'tag' ? <TagsOutlined /> : <FileTextOutlined />}
              <Title level={4} style={{ margin: 0 }}>
                {material.name}
              </Title>
            </Space>
            <div style={{ marginTop: 8 }}>
              <Tag color={getDifficultyColor(material.difficulty)}>
                {material.difficulty || '中级'}
              </Tag>
              {material.type === 'tag' && (
                <Tag color={material.color || 'blue'}>
                  {material.fileCount || 0} 个文档
                </Tag>
              )}
            </div>
          </div>

          <Paragraph 
            type="secondary" 
            style={{ marginBottom: 16 }}
            ellipsis={{ rows: 2, tooltip: material.summary }}
          >
            {material.summary || material.description || '暂无描述'}
          </Paragraph>

          <Space wrap>
            {material.stages && (
              <Tag icon={<BookOutlined />}>
                {material.stages} 个阶段
              </Tag>
            )}
            {material.keyPoints && (
              <Tag icon={<TrophyOutlined />}>
                {material.keyPoints} 个要点
              </Tag>
            )}
            {material.estimatedTime && (
              <Tag icon={<ClockCircleOutlined />}>
                约 {material.estimatedTime} 分钟
              </Tag>
            )}
          </Space>

          {material.type === 'file' && material.fileType && (
            <div>
              <Tag>{material.fileType.toUpperCase()}</Tag>
              {material.uploadTime && (
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  上传于 {new Date(material.uploadTime).toLocaleDateString()}
                </Text>
              )}
            </div>
          )}

          {material.type === 'tag' && material.topics && material.topics.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>主题: </Text>
              {material.topics.slice(0, 2).map((topic, index) => (
                <Tag key={index} >{topic}</Tag>
              ))}
            </div>
          )}
        </Space>
      </div>

      <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>推荐题目数量: </Text>
            <Text type="secondary">{getRecommendedQuestionCount(material)} 题</Text>
          </div>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => {
              setSelectedMaterial(material.id);
              setQuestionCount(getRecommendedQuestionCount(material));
              handleStartTest(material);
            }}
            loading={isMaterialGenerating(material.id, material.type)}
            disabled={isGenerationLocked() && !isMaterialGenerating(material.id, material.type)}
            block
          >
            开始测试
          </Button>
        </Space>
      </div>
    </Card>
  );

  const renderMaterialList = (materialList: Material[], emptyText: string) => {
    if (materialList.length === 0) {
      return (
        <Empty
          description={emptyText}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '40px 0' }}
        >
          <Button type="primary" onClick={() => fetchMaterials()}>
            重新加载
          </Button>
        </Empty>
      );
    }

    return (
      <div>
        {materialList.map(renderMaterialCard)}
      </div>
    );
  };

  return (
    <div>      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        tabBarExtraContent={{
          right: (
            <Button 
              type="primary" 
              icon={<ReloadOutlined />}
              onClick={() => fetchMaterials()}
            > 
              重新加载
            </Button>
          )
        }}
        items={[
          {
            key: 'files',
            label: '文件',
            children: renderMaterialList(materials.files, '暂无文件材料')
          },
          {
            key: 'tags',
            label: '标签',
            children: renderMaterialList(materials.tags, '暂无标签材料')
          }
        ]}
      />
    </div>          
  );
};

export default QuizMenuPage;
