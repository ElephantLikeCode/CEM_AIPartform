import React, { useEffect } from 'react';
import { Card, Switch, Tooltip, Space, Typography, Alert, Spin, Divider, message } from 'antd';
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
    setIsDeepSeekAvailable,
    
    // 🔧 新增：强制同步功能
    forceSyncSettings,
    isSyncing
  } = useAIModel();
  
  const [checking, setChecking] = React.useState(false);

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
  }, []);  // 🔧 增强：AI总开关处理，直接调用后端API同步
  const handleAIEnabledChange = async (enabled: boolean) => {
    console.log(`🔄 管理员修改AI总开关: ${enabled ? '开启' : '关闭'}`);
    
    try {
      // 🔧 直接调用后端API同步，而不是通过context
      const response = await axios.post('/api/system/sync-ai-settings', {
        isAIEnabled: enabled,
        currentModel: currentModel,
        reason: `管理员${enabled ? '开启' : '关闭'}AI功能`
      });
      
      if (response.data.success) {
        // 更新本地状态
        setIsAIEnabled(enabled);
        
        // 立即触发强制同步，确保所有组件获得最新设置
        await forceSyncSettings();
        
        message.success({
          content: `✅ AI功能${enabled ? '开启' : '关闭'}成功，已通知所有用户`,
          duration: 4
        });
        
        // 🔧 触发跨标签页同步信号
        localStorage.setItem('ai-settings-update-trigger', Date.now().toString());
        setTimeout(() => {
          localStorage.removeItem('ai-settings-update-trigger');
        }, 1000);
        
        console.log(`✅ AI总开关设置完成: ${enabled}, 版本: ${response.data.version}`);
      } else {
        throw new Error(response.data.message || '设置失败');
      }
      
    } catch (error) {
      console.error('❌ AI开关设置失败:', error);
      message.error('AI开关设置失败，请重试');
    }
  };
  // 🔧 增强：AI模型切换处理，直接调用后端API同步
  const handleModelSwitch = async (useDeepSeek: boolean) => {
    if (!isAIEnabled) return; // AI总开关关闭时不允许切换
    
    if (useDeepSeek && !isDeepSeekAvailable) {
      // 如果选择DeepSeek但不可用，重新检查一次
      checkDeepSeekAvailability();
      return;
    }
    
    const newModel = useDeepSeek ? 'deepseek' : 'local';
    console.log(`🔄 管理员修改AI模型: ${currentModel} -> ${newModel}`);
    
    try {
      // 🔧 直接调用后端API同步，而不是通过context
      const response = await axios.post('/api/system/sync-ai-settings', {
        isAIEnabled: isAIEnabled,
        currentModel: newModel,
        reason: `管理员切换模型: ${currentModel} -> ${newModel}`
      });
      
      if (response.data.success) {
        // 更新本地状态
        setCurrentModel(newModel);
        
        // 立即触发强制同步，确保所有组件获得最新设置
        await forceSyncSettings();
        
        message.success({
          content: `✅ AI模型已切换为${useDeepSeek ? 'DeepSeek API' : '本地模型'}，已通知所有用户`,
          duration: 4
        });
        
        // 🔧 触发跨标签页同步信号
        localStorage.setItem('ai-settings-update-trigger', Date.now().toString());
        setTimeout(() => {
          localStorage.removeItem('ai-settings-update-trigger');
        }, 1000);
        
        console.log(`✅ AI模型切换完成: ${newModel}, 版本: ${response.data.version}`);
      } else {
        throw new Error(response.data.message || '切换失败');
      }
        } catch (error) {
      console.error('❌ AI模型切换失败:', error);
      message.error('AI模型切换失败，请重试');
    }
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
              onChange={handleAIEnabledChange}
              checkedChildren="开启"
              unCheckedChildren="关闭"
              loading={isSyncing}
            />
          </Tooltip>
        </Space>

        {isAIEnabled && (
          <>
            <Divider style={{ margin: '12px 0' }} />
              {/* 模型选择区域 */}            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <Space align="center">
                <RobotOutlined style={{ fontSize: '18px', color: '#1890ff' }} />
                <Title level={5} style={{ margin: 0 }}>
                  AI模型选择
                </Title>
                {(checking || isSyncing) && <Spin size="small" />}
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
              >                <Switch
                  checked={currentModel === 'deepseek'}
                  onChange={handleModelSwitch}
                  disabled={!isDeepSeekAvailable}
                  checkedChildren={<ApiOutlined />}
                  unCheckedChildren={<ExperimentOutlined />}
                  loading={checking || isSyncing}
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
          {isSyncing && ' • 正在同步设置...'}
        </Text>
      </Space>
    </Card>
  );
};

export default AIModelSwitcher;
