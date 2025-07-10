import React, { useEffect } from 'react';
import { Card, Switch, Tooltip, Space, Typography, Alert, Spin, Divider } from 'antd';
import { RobotOutlined, ApiOutlined, ExperimentOutlined, PoweroffOutlined, SettingOutlined } from '@ant-design/icons';
import { useAIModel } from '../contexts/AIModelContext';
import axios from 'axios';

const { Text, Title } = Typography;

interface AIModelSwitcherProps {
  className?: string;
}

const AIModelSwitcher: React.FC<AIModelSwitcherProps> = ({ className }) => {  const { 
    // AI总开关
    isAIEnabled,
    setIsAIEnabled,
    
    // 模型选择
    currentModel, 
    setCurrentModel,
    
    // DeepSeek可用性
    isDeepSeekAvailable, 
    setIsDeepSeekAvailable 
  } = useAIModel();
  
  const [checking, setChecking] = React.useState(false);
  const userRole = localStorage.getItem('userRole') || 'user';

  // 检查DeepSeek API可用性
  const checkDeepSeekAvailability = async () => {
    setChecking(true);
    try {
      const response = await axios.get('/api/quiz/deepseek-status');
      setIsDeepSeekAvailable(response.data.available);
    } catch (error) {
      console.error('检查DeepSeek可用性失败:', error);
      setIsDeepSeekAvailable(false);
    } finally {
      setChecking(false);
    }
  };

  // 组件加载时检查DeepSeek可用性
  useEffect(() => {
    checkDeepSeekAvailability();
  }, []);
  const handleModelSwitch = (useDeepSeek: boolean) => {
    if (!isAIEnabled) return; // AI总开关关闭时不允许切换
    
    if (useDeepSeek && !isDeepSeekAvailable) {
      // 如果选择DeepSeek但不可用，重新检查一次
      checkDeepSeekAvailability();
      return;
    }
    
    setCurrentModel(useDeepSeek ? 'deepseek' : 'local');
  };

  return (
    <Card 
      className={className}
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* AI总开关区域 */}
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space align="center">
            <PoweroffOutlined style={{ fontSize: '18px', color: isAIEnabled ? '#52c41a' : '#ff4d4f' }} />
            <Title level={5} style={{ margin: 0 }}>
              AI功能总开关
            </Title>
          </Space>
          
          <Tooltip title={isAIEnabled ? "关闭所有AI功能" : "启用AI功能"}>
            <Switch
              checked={isAIEnabled}
              onChange={setIsAIEnabled}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
          </Tooltip>
        </Space>

        {isAIEnabled && userRole === 'admin' && (
          <>
            <Divider style={{ margin: '12px 0' }} />
              {/* 模型选择区域 */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <Space align="center">
                <RobotOutlined style={{ fontSize: '18px', color: '#1890ff' }} />
                <Title level={5} style={{ margin: 0 }}>
                  AI模型选择
                </Title>
                {checking && <Spin size="small" />}
              </Space>
            </div>
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '16px',
              padding: '8px 0'
            }}>
              <Space align="center">
                <ExperimentOutlined />
                <Text>本地模型</Text>
              </Space>
              
              <Tooltip 
                title={
                  isDeepSeekAvailable
                    ? "切换AI模型：本地模型 ↔ DeepSeek API" 
                    : "DeepSeek API不可用，请检查配置"
                }
              >
                <Switch
                  checked={currentModel === 'deepseek'}
                  onChange={handleModelSwitch}
                  disabled={!isDeepSeekAvailable}
                  checkedChildren={<ApiOutlined />}
                  unCheckedChildren={<ExperimentOutlined />}
                  loading={checking}
                />
              </Tooltip>
              
              <Space align="center">
                <ApiOutlined />
                <Text>DeepSeek API</Text>
              </Space>
            </div>

            <Divider style={{ margin: '12px 0' }} />
            
            {/* 状态提示信息 */}
            {!isDeepSeekAvailable && (
              <Alert
                message="DeepSeek API不可用"
                description="请检查API密钥配置或网络连接，将使用本地AI模型"
                type="warning"
                showIcon
              />
            )}
          </>
        )}

        {!isAIEnabled && (
          <Alert
            message="AI功能已关闭"
            description="所有AI相关功能（包括聊天、文档分析、题目生成等）将不可用"
            type="error"
            showIcon
          />
        )}
        
        <Text type="secondary" style={{ fontSize: '12px' }}>
          当前设置将影响所有AI功能：文档分析、学习教程、题目生成等
        </Text>
      </Space>
    </Card>
  );
};

export default AIModelSwitcher;
