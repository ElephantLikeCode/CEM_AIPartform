import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Form, Typography, message, Tabs, Space, Divider } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  MailOutlined, 
  SafetyOutlined,
  EyeInvisibleOutlined,
  EyeTwoTone,
  LoginOutlined,
  UserAddOutlined,
  ThunderboltOutlined,
  StarOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [activeTab, setActiveTab] = useState('login');
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 倒计时效果
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [countdown]);

  // 邮箱格式验证函数
  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };
  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/login', values, { withCredentials: true });
      if (response.data.success) {
        // 登录成功后写入 userId
        if (response.data.user && response.data.user.id) {
          localStorage.setItem('userId', response.data.user.id.toString());
        }
        
        message.success('🎉 登录成功！欢迎回来');
        
        // 根据用户角色导航到合适的页面
        const userRole = response.data.user?.role || 'user';
        if (userRole === 'admin' || userRole === 'sub_admin') {
          navigate('/database');
        } else {
          navigate('/learning');
        }
      } else {
        throw new Error(response.data.message || '登录失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: { email: string; password: string; code: string }) => {
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/register', values);
      if (response.data.success) {
        message.success('🎉 注册成功！请登录');
        setActiveTab('login');
        registerForm.resetFields();
        setCountdown(0);
      } else {
        throw new Error(response.data.message || '注册失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    try {
      const email = registerForm.getFieldValue('email');
      
      if (!email) {
        message.error('请先输入邮箱地址');
        return;
      }

      if (!validateEmail(email)) {
        message.error('请输入正确的邮箱格式，如：example@domain.com');
        return;
      }

      setSendingCode(true);
      
      const response = await axios.post('/api/auth/send-code', { email });
      if (response.data.success) {
        message.success('📧 验证码已发送，请检查您的邮箱');
        setCountdown(60);
      } else {
        throw new Error(response.data.message || '发送验证码失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message);
      setCountdown(0);
    } finally {
      setSendingCode(false);
    }
  };

  const getSendCodeButtonProps = () => {
    if (sendingCode) {
      return {
        disabled: true,
        children: '发送中...',
        loading: true
      };
    }
    
    if (countdown > 0) {
      return {
        disabled: true,
        children: `${countdown}s`
      };
    }
    
    return {
      disabled: false,
      children: '获取验证码'
    };
  };

  const features = [
    { icon: <ThunderboltOutlined style={{ color: '#1890ff' }} />, text: '智能AI分析' },
    { icon: <StarOutlined style={{ color: '#52c41a' }} />, text: '个性化学习' },
    { icon: <CheckCircleOutlined style={{ color: '#722ed1' }} />, text: '专业认证' }
  ];
  return (
    <div className="login-page-container" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '16px' : '20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 背景装饰元素 - 仅在桌面端显示 */}
      {!isMobile && (
        <>
          <div 
            className="login-background-decoration floating-dots"            style={{
              position: 'absolute',
              top: '-10%',
              left: '-10%',
              width: '120%',
              height: '120%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '30px 30px'
            }} 
          />

          <div 
            className="login-background-decoration pulse-circle-1"
            style={{
              position: 'absolute',
              top: '10%',
              right: '10%',
              width: '200px',
              height: '200px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '50%'
            }} 
          />

          <div 
            className="login-background-decoration pulse-circle-2"
            style={{
              position: 'absolute',
              bottom: '10%',
              left: '10%',
              width: '150px',
              height: '150px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '50%'
            }} 
          />
        </>
      )}

      {/* 主容器 */}
      <div className="login-main-container" style={{
        display: 'flex',
        maxWidth: isMobile ? '100%' : '1000px',
        width: '100%',
        background: 'rgba(255,255,255,0.95)',
        borderRadius: isMobile ? '12px' : '20px',
        boxShadow: isMobile ? '0 8px 24px rgba(0,0,0,0.15)' : '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
        flexDirection: isMobile ? 'column' : 'row'
      }}>        {/* 左侧信息面板 - 仅在桌面端显示 */}
        {!isMobile && (
          <div className="login-info-panel" style={{
            flex: 1,
            background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
            padding: '60px 40px',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative'
          }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.1"%3E%3Ccircle cx="30" cy="30" r="4"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            opacity: 0.3
          }} />
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              width: '80px',
              height: '80px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '30px',
              fontSize: '40px'
            }}>
              🤖
            </div>
            
            <Title level={2} style={{ 
              color: 'white', 
              marginBottom: '16px',
              fontSize: '28px',
              fontWeight: 'bold'
            }}>
              澳電CEM AI學習平台
            </Title>
            
            <Paragraph style={{ 
              color: 'rgba(255,255,255,0.9)', 
              fontSize: '16px',
              lineHeight: '1.6',
              marginBottom: '40px'
            }}>
              采用最新AI技术，为您提供个性化的学习体验。智能分析文档内容，生成定制化学习路径，让学习更高效、更有趣。
            </Paragraph>

            <Space direction="vertical" size={16}>
              {features.map((feature, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '14px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px'
                  }}>
                    {feature.icon}
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {feature.text}
                  </span>
                </div>
              ))}
            </Space>          </div>
        </div>
        )}

        {/* 右侧登录表单 */}
        <div className="login-form-panel" style={{
          flex: 1,
          padding: isMobile ? '24px 20px' : '60px 40px',
          background: 'white'
        }}>          <div style={{ textAlign: 'center', marginBottom: isMobile ? '24px' : '40px' }}>
            <Title level={3} style={{ 
              color: '#333',
              marginBottom: '8px',
              fontSize: isMobile ? '20px' : '24px'
            }}>
              {isMobile ? '澳電智能學習平臺' : '欢迎使用'}
            </Title>
            <Text style={{ color: '#666', fontSize: isMobile ? '13px' : '14px' }}>
              {isMobile ? '请登录您的账户或创建新账户' : '请登录您的账户或创建新账户'}
            </Text>
          </div>          <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab}
            centered
            size={isMobile ? "middle" : "large"}
            style={{ marginBottom: isMobile ? '16px' : '20px' }}
            className="custom-tabs"
            items={[
              {
                key: 'login',
                label: (
                  <span>
                    <LoginOutlined />
                    登录
                  </span>
                ),
                children: (
                  <Form
                    form={loginForm}
                    layout="vertical"
                    onFinish={handleLogin}
                    style={{ marginTop: '20px' }}
                  >
                    <Form.Item
                      name="email"
                      rules={[
                        { required: true, message: '请输入邮箱' },
                        { 
                          pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
                          message: '请输入正确的邮箱格式' 
                        }
                      ]}
                    >
                      <Input
                        prefix={<MailOutlined style={{ color: '#1890ff' }} />}
                        placeholder="邮箱地址"
                        size="large"
                        style={{ borderRadius: '8px' }}
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#1890ff' }} />}
                        placeholder="密码"
                        size="large"
                        style={{ borderRadius: '8px' }}
                        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                      />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: '16px' }}>
                      <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading} 
                        block 
                        size="large"
                        style={{
                          borderRadius: '8px',
                          height: '48px',
                          fontSize: '16px',
                          fontWeight: '500',
                          background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                        }}
                        icon={<LoginOutlined />}
                      >
                        立即登录
                      </Button>
                    </Form.Item>
                  </Form>
                )
              },
              {
                key: 'register',
                label: (
                  <span>
                    <UserAddOutlined />
                    注册
                  </span>
                ),
                children: (
                  <>
                    <Form
                      form={registerForm}
                      layout="vertical"
                      onFinish={handleRegister}
                      style={{ marginTop: '20px' }}
                    >
                      <Form.Item
                        name="email"
                        rules={[
                          { required: true, message: '请输入邮箱' },
                          { 
                            pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
                            message: '请输入正确的邮箱格式' 
                          }
                        ]}
                      >
                        <Input
                          prefix={<MailOutlined style={{ color: '#1890ff' }} />}
                          placeholder="邮箱地址"
                          size="large"
                          style={{ borderRadius: '8px' }}
                        />
                      </Form.Item>

                      <Form.Item
                        name="code"
                        rules={[{ required: true, message: '请输入验证码' }]}
                      >
                        <Input
                          prefix={<SafetyOutlined style={{ color: '#1890ff' }} />}
                          placeholder="请输入6位验证码"
                          maxLength={6}
                          size="large"
                          style={{ borderRadius: '8px' }}
                          addonAfter={
                            <Button 
                              onClick={handleSendCode}
                              {...getSendCodeButtonProps()}
                              style={{
                                border: 'none',
                                backgroundColor: 'transparent',
                                color: countdown > 0 || sendingCode ? '#999' : '#1890ff',
                                cursor: countdown > 0 || sendingCode ? 'not-allowed' : 'pointer',
                                fontSize: '12px'
                              }}
                            />
                          }
                        />
                      </Form.Item>

                      <Form.Item
                        name="password"
                        rules={[
                          { required: true, message: '请输入密码' },
                          { min: 6, message: '密码至少6位' }
                        ]}
                      >
                        <Input.Password
                          prefix={<LockOutlined style={{ color: '#1890ff' }} />}
                          placeholder="密码（至少6位）"
                          size="large"
                          style={{ borderRadius: '8px' }}
                          iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                        />
                      </Form.Item>

                      <Form.Item style={{ marginBottom: '16px' }}>
                        <Button 
                          type="primary" 
                          htmlType="submit" 
                          loading={loading} 
                          block 
                          size="large"
                          style={{
                            borderRadius: '8px',
                            height: '48px',
                            fontSize: '16px',
                            fontWeight: '500',
                            background: 'linear-gradient(45deg, #52c41a 0%, #73d13d 100%)',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(82, 196, 26, 0.4)'
                          }}
                          icon={<UserAddOutlined />}
                        >
                          立即注册
                        </Button>
                      </Form.Item>
                    </Form>

                    {countdown > 0 && (
                      <div style={{ 
                        textAlign: 'center', 
                        color: '#666', 
                        fontSize: '12px',
                        background: '#f0f8ff',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #e6f4ff'
                      }}>
                        📧 验证码已发送到您的邮箱，请注意查收
                      </div>
                    )}
                  </>
                )
              }
            ]}
          />

          <Divider style={{ margin: '30px 0', color: '#ccc' }}>
            <Text style={{ color: '#999', fontSize: '12px' }}>
              安全登录 · 隐私保护
            </Text>
          </Divider>

          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: '#999', fontSize: '12px' }}>
              登录即表示您同意{' '}
              <a href="#" style={{ color: '#1890ff' }}>服务条款</a>
              {' '}和{' '}
              <a href="#" style={{ color: '#1890ff' }}>隐私政策</a>
            </Text>
          </div>
        </div>
      </div>

      {/* CSS 动画样式 */}
      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
          }
          
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
          
          .floating-dots {
            animation: float 20s ease-in-out infinite;
          }
          
          .pulse-circle-1 {
            animation: pulse 4s ease-in-out infinite;
          }
          
          .pulse-circle-2 {
            animation: pulse 3s ease-in-out infinite;
          }
          
          .custom-tabs .ant-tabs-tab {
            font-weight: 500 !important;
          }
          
          .custom-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
            background: linear-gradient(45deg, #667eea 0%, #764ba2 100%) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
          }
        `}
      </style>
    </div>
  );
};

export default LoginPage;
