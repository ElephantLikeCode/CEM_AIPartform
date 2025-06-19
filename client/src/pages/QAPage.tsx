import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layout, Menu, Input, Button, Select, Tag, Avatar, Spin, message,
  Divider, Space, Typography, Modal, Empty, Tooltip, Popconfirm, List,
  Drawer,
  type InputRef
} from 'antd';
import {
  SendOutlined, RobotOutlined, UserOutlined, BookOutlined, TagsOutlined,
  FileTextOutlined, PlusOutlined, MessageOutlined, DeleteOutlined, EditOutlined,
  MenuOutlined, CloseOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useAIModel } from '../contexts/AIModelContext';
import { v4 as uuidv4 } from 'uuid';

const { Sider, Content } = Layout;
const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

// 数据类型定义
interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string;
}

interface Conversation {
  id: number;
  session_id: string;
  title: string;
  user_id: number;
  knowledge_mode: 'tag' | 'document' | 'all';
  knowledge_source_id?: string;
  knowledge_source_name?: string;
  ai_model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface KnowledgeSource {
  type: 'tag' | 'document';
  id: string;
  name: string;
}

const QAPage: React.FC = () => {
  const { currentModel } = useAIModel();
  // 动态获取当前登录用户ID
  const userId = Number(localStorage.getItem('userId'));

  // 响应式状态管理
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 状态管理
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  
  // 新建对话模态框状态
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newConversationConfig, setNewConversationConfig] = useState({
    knowledgeMode: 'all' as 'tag' | 'document' | 'all',
    selectedSource: ''
  });
  const [tagOptions, setTagOptions] = useState<KnowledgeSource[]>([]);
  const [documentOptions, setDocumentOptions] = useState<KnowledgeSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputRef>(null);

  // 检测是否为移动端
  const checkIsMobile = useCallback(() => {
    const mobile = window.innerWidth <= 768;
    setIsMobile(mobile);
    if (mobile) {
      setSidebarCollapsed(true); // 移动端默认折叠侧边栏
    } else {
      setSidebarCollapsed(false); // 桌面端默认展开侧边栏
    }
  }, []);

  useEffect(() => {
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, [checkIsMobile]);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  // 加载对话历史
  const fetchConversations = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const response = await axios.get(`/api/aiConversations/${userId}`);
      if (response.data.success) {
        setConversations(response.data.data);
      } else {
        message.error('加载对话历史失败');
      }
    } catch (error) {
      console.error('加载对话历史失败:', error);
      message.error('加载对话历史失败');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // 加载知识库选项
  const loadKnowledgeSources = async () => {
    setLoadingSources(true);
    try {
      const [tagsResponse, documentsResponse] = await Promise.all([
        axios.get('/api/quiz/tags'),
        axios.get('/api/learning/materials')
      ]);
      if (tagsResponse.data.success) {
        setTagOptions(tagsResponse.data.data.map((tag: any) => ({
          type: 'tag' as const, id: tag.id.toString(), name: tag.name
        })));
      }
      if (documentsResponse.data.success) {
        setDocumentOptions(documentsResponse.data.data.map((doc: any) => ({
          type: 'document' as const, id: doc.id, name: doc.name
        })));
      }
    } catch (error) {
      console.error('加载知识库选项失败:', error);
      message.error('加载知识库选项失败');
    } finally {
      setLoadingSources(false);
    }
  };
  // 切换对话
  const handleSelectConversation = async (conversation: Conversation) => {
    if (isLoading) {
      message.warning('请等待当前回答完成');
      return;
    }
    setActiveConversation(conversation);
    setMessages([]);
    setIsLoading(true);
    
    // 移动端选择对话后自动折叠侧边栏
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    
    try {
      const response = await axios.get(`/api/aiConversations/${conversation.session_id}/messages?userId=${userId}`);
      if (response.data.success) {
        const fetchedMessages = response.data.data.messages.map((msg: any) => ({
          id: msg.message_id,
          type: msg.message_type,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          model: msg.ai_model
        }));
        setMessages(fetchedMessages);
      } else {
        message.error('加载对话消息失败');
      }
    } catch (error) {
      console.error('加载对话消息失败:', error);
      message.error('加载对话消息失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 显示新建对话模态框
  const showNewConversationModal = () => {
    loadKnowledgeSources();
    setIsModalVisible(true);
  };

  // 处理新建对话
  const handleCreateConversation = async () => {
    if (!userId) {
      message.error('请先登录');
      return;
    }
    let sourceName = '全部知识库';
    let sourceId: string | undefined = undefined;

    if (newConversationConfig.knowledgeMode === 'tag') {
      const tag = tagOptions.find(t => t.id === newConversationConfig.selectedSource);
      if (tag) {
        sourceName = tag.name;
        sourceId = tag.id;
      }
    } else if (newConversationConfig.knowledgeMode === 'document') {
      const doc = documentOptions.find(d => d.id === newConversationConfig.selectedSource);
      if (doc) {
        sourceName = doc.name;
        sourceId = doc.id;
      }
    }

    const title = `与 ${sourceName} 的对话`;

    try {
      const response = await axios.post('/api/aiConversations', {
        userId,
        title,
        knowledgeMode: newConversationConfig.knowledgeMode,
        knowledgeSourceId: sourceId,
        knowledgeSourceName: sourceName,
        aiModel: currentModel
      });      if (response.data.success) {
        const newConversation = response.data.data;
        setConversations([newConversation, ...conversations]);
        setActiveConversation(newConversation);
        setMessages([]);
        setIsModalVisible(false);
        setNewConversationConfig({ knowledgeMode: 'all', selectedSource: '' });
        
        // 移动端创建对话后自动折叠侧边栏
        if (isMobile) {
          setSidebarCollapsed(true);
        }
        
        message.success('新对话已创建');
      } else {
        message.error('创建新对话失败');
      }
    } catch (error) {
      console.error('创建新对话失败:', error);
      message.error('创建新对话失败');
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !activeConversation || !activeConversation.session_id) return;


    const userMessage: Message = {
      id: uuidv4(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await axios.post(`/api/aiConversations/${activeConversation.session_id}/messages`, {
        userId,
        message: inputValue,
      });

      if (response.data.success) {
        const aiMessage: Message = {
          id: response.data.data.aiMessage.id,
          type: 'assistant',
          content: response.data.data.aiMessage.content,
          timestamp: new Date(response.data.data.aiMessage.timestamp),
          model: response.data.data.aiMessage.model
        };
        setMessages(prev => [...prev, aiMessage]);
        // 更新侧边栏的消息数量
        setConversations(convs => convs.map(c => 
          c.id === activeConversation.id ? { ...c, message_count: c.message_count + 2 } : c
        ));
      } else {
        message.error('发送消息失败');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      const errorResponse: Message = {
        id: uuidv4(),
        type: 'assistant',
        content: '抱歉，AI服务暂时不可用，请稍后重试。',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 删除对话
  const handleDeleteConversation = async (sessionId: string) => {
    try {
      await axios.delete(`/api/aiConversations/${sessionId}?userId=${userId}`);
      message.success('对话已删除');
      fetchConversations();
      if (activeConversation?.session_id === sessionId) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('删除对话失败:', error);
      message.error('删除对话失败');
    }
  };

  // 渲染知识库选择器
  const renderSourceSelector = () => {
    const options = newConversationConfig.knowledgeMode === 'tag' ? tagOptions : documentOptions;
    return (
      <Select
        showSearch
        loading={loadingSources}
        value={newConversationConfig.selectedSource || undefined}
        placeholder={`请选择一个${newConversationConfig.knowledgeMode === 'tag' ? '标签' : '文档'}`}
        style={{ width: '100%' }}
        onChange={(value) => setNewConversationConfig(prev => ({ ...prev, selectedSource: value }))}
        filterOption={(input, option) =>
          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())        }
        options={options.map(opt => ({ value: opt.id, label: opt.name }))}
      />
    );
  };

  // 渲染侧边栏内容
  const renderSidebarContent = () => (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={showNewConversationModal}
        style={{ marginBottom: '12px' }}
      >
        新建对话
      </Button>
      <Title level={5} style={{ marginTop: 0, marginBottom: '8px' }}>对话历史</Title>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isHistoryLoading ? <Spin /> : (
          <List
            dataSource={conversations}
            renderItem={item => (
              <List.Item
                key={item.session_id}
                onClick={() => handleSelectConversation(item)}
                style={{ 
                  cursor: 'pointer', 
                  padding: '8px 12px',
                  borderRadius: '4px',
                  backgroundColor: activeConversation?.session_id === item.session_id ? '#e6f7ff' : 'transparent'
                }}
                actions={[
                  <Popconfirm
                    title="确定删除这个对话吗？"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDeleteConversation(item.session_id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Tooltip title="删除对话">
                      <Button type="text" shape="circle" icon={<DeleteOutlined />} size="small" onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Popconfirm>
                ]}
              >                <List.Item.Meta
                  avatar={<MessageOutlined />}
                  title={<Text className="learning-material-title" style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}>{item.title}</Text>}
                  description={<Text type="secondary" ellipsis>{`共 ${item.message_count} 条消息`}</Text>}
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
  return (
    <Layout style={{ height: 'calc(100vh - 112px)' }}>
      {/* 移动端使用Drawer，桌面端使用Sider */}
      {isMobile ? (
        <Drawer
          title="对话历史"
          placement="left"
          open={!sidebarCollapsed}
          onClose={() => setSidebarCollapsed(true)}
          width={280}
          bodyStyle={{ padding: 0 }}
          headerStyle={{ padding: '12px 16px' }}
          extra={
            <Button type="text" icon={<CloseOutlined />} onClick={() => setSidebarCollapsed(true)} />
          }
        >
          {renderSidebarContent()}
        </Drawer>
      ) : (
        <Sider 
          width={280} 
          theme="light" 
          style={{ borderRight: '1px solid #f0f0f0' }}
          collapsed={sidebarCollapsed}
          collapsedWidth={0}
        >
          {renderSidebarContent()}
        </Sider>
      )}
      
      <Content style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 移动端顶部工具栏 */}
        {isMobile && (
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Button 
              type="text" 
              icon={<MenuOutlined />} 
              onClick={() => setSidebarCollapsed(false)}
              style={{ padding: '4px 8px' }}
            >
              对话历史
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={showNewConversationModal}
              size="small"
            >
              新建
            </Button>
          </div>
        )}
        
        {activeConversation ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px' }}>
            <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f0f0f0' }}>              <Title level={4} style={{ margin: 0, fontSize: isMobile ? '16px' : '20px' }} className="learning-material-title">
                {activeConversation.title}
              </Title>
              <Space wrap>
                <Text type="secondary">知识库范围:</Text>
                <Tag icon={activeConversation.knowledge_mode === 'tag' ? <TagsOutlined /> : <FileTextOutlined />} color="blue">
                  {activeConversation.knowledge_source_name || '全部'}
                </Tag>
                <Text type="secondary">AI模型:</Text>
                <Tag color={activeConversation.ai_model === 'deepseek' ? 'geekblue' : 'green'}>
                  {activeConversation.ai_model}
                </Tag>
              </Space>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {messages.map((msg, index) => (
                <div key={index} style={{ 
                  marginBottom: '16px', 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  flexDirection: isMobile && msg.type === 'user' ? 'row-reverse' : 'row'
                }}>
                  <Avatar 
                    icon={msg.type === 'user' ? <UserOutlined /> : <RobotOutlined />} 
                    style={{ 
                      margin: isMobile && msg.type === 'user' ? '0 0 0 12px' : '0 12px 0 0',
                      flexShrink: 0
                    }} 
                  />
                  <div style={{ 
                    background: msg.type === 'user' ? '#e6f7ff' : '#f0f2f5', 
                    padding: isMobile ? '8px 10px' : '8px 12px', 
                    borderRadius: '8px', 
                    maxWidth: isMobile ? '85%' : '80%',
                    wordBreak: 'break-word'
                  }}>
                    <Paragraph style={{ margin: 0, fontSize: isMobile ? '14px' : '14px' }}>
                      {msg.content}
                    </Paragraph>
                    <Text type="secondary" style={{ 
                      fontSize: isMobile ? '11px' : '12px', 
                      marginTop: '4px', 
                      display: 'block' 
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                      {msg.model && ` (模型: ${msg.model})`}
                    </Text>
                  </div>
                </div>
              ))}
              {isLoading && <Spin style={{ display: 'block', marginTop: '12px' }} />}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ 
              marginTop: '16px', 
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? '8px' : '12px'
            }}>
              <TextArea
                ref={inputRef}
                rows={isMobile ? 3 : 2}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="输入您的问题..."
                disabled={isLoading}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendMessage}
                loading={isLoading}
                style={{ 
                  alignSelf: isMobile ? 'stretch' : 'flex-end',
                  height: isMobile ? '40px' : 'auto'
                }}
                block={isMobile}
              >
                发送
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            flexDirection: 'column',
            padding: '16px'
          }}>
            <Empty description="请选择一个对话或新建一个对话开始" />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={showNewConversationModal} 
              style={{ marginTop: '16px' }}
            >
              新建对话
            </Button>
          </div>
        )}
      </Content>
      
      <Modal
        title="新建对话"
        open={isModalVisible}
        onOk={handleCreateConversation}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={isLoading}
        okText="开始对话"
        cancelText="取消"
        centered={isMobile}
        width={isMobile ? '90%' : 520}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>请选择本次对话的知识库范围：</Text>
          <Select
            value={newConversationConfig.knowledgeMode}
            style={{ width: '100%' }}
            onChange={(value) => setNewConversationConfig({ knowledgeMode: value, selectedSource: '' })}
          >
            <Select.Option value="all">全部知识库</Select.Option>
            <Select.Option value="tag">按标签</Select.Option>
            <Select.Option value="document">按文档</Select.Option>
          </Select>
          {newConversationConfig.knowledgeMode !== 'all' && renderSourceSelector()}
        </Space>
      </Modal>
    </Layout>
  );
};

export default QAPage;



