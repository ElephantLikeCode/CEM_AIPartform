import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  message, 
  Typography, 
  Space,
  Row,
  Col,
  Divider,
  Avatar,
  Tag
} from 'antd';
import { 
  UserOutlined, 
  SettingOutlined, 
  EditOutlined,
  SaveOutlined,
  MailOutlined,
  KeyOutlined,
  LockOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const { Title, Text } = Typography;

interface UserInfo {
  id: number;
  email: string;
  username?: string;
  role: string;
  createdAt: string; // 修改为驼峰命名，匹配后端返回
}

const UserSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // 获取用户信息
  const fetchUserInfo = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.success) {
        const userData = response.data.data;
        setUserInfo(userData);
        form.setFieldsValue({
          username: userData.username || ''
        });
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      message.error('获取用户信息失败');
    }
  };

  // 修改用户名
  const handleUpdateUsername = async (values: { username: string }) => {
    setLoading(true);
    try {
      const response = await axios.put('/api/auth/update-username', 
        { username: values.username }
      );
      
      if (response.data.success) {
        message.success('用户名修改成功');
        setEditing(false);
        fetchUserInfo(); // 重新获取用户信息
      } else {
        message.error(response.data.message || '修改用户名失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '修改用户名失败');
    } finally {
      setLoading(false);
    }
  };

  // 修改密码
  const handleUpdatePassword = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    setPasswordLoading(true);
    try {
      const response = await axios.put('/api/auth/update-password', 
        { 
          currentPassword: values.currentPassword,
          newPassword: values.newPassword 
        }
      );
      
      if (response.data.success) {
        message.success('密码修改成功');
        setEditingPassword(false);
        passwordForm.resetFields();
      } else {
        message.error(response.data.message || '修改密码失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '修改密码失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  // 取消编辑
  const handleCancel = () => {
    setEditing(false);
    form.setFieldsValue({
      username: userInfo?.username || ''
    });
  };

  // 取消密码编辑
  const handlePasswordCancel = () => {
    setEditingPassword(false);
    passwordForm.resetFields();
  };

  // 获取角色标签
  const getRoleTag = (role: string) => {
    switch (role) {
      case 'admin':
        return <Tag color="red">超级管理员</Tag>;
      case 'sub_admin':
        return <Tag color="orange">二级管理员</Tag>;
      case 'user':
        return <Tag color="blue">普通用户</Tag>;
      default:
        return <Tag color="default">未知角色</Tag>;
    }
  };

  useEffect(() => {
    fetchUserInfo();
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <Title level={2}>
        <SettingOutlined style={{ marginRight: 8 }} />
        个人设置
      </Title>

      {userInfo && (
        <Row gutter={[24, 24]}>
          {/* 用户信息卡片 */}
          <Col span={24}>
            <Card 
              title={
                <Space>
                  <UserOutlined />
                  个人信息
                </Space>
              }
            >
              <Row gutter={[16, 16]}>
                <Col span={24} md={8}>
                  <div style={{ textAlign: 'center' }}>
                    <Avatar 
                      size={80} 
                      icon={<UserOutlined />} 
                      style={{ backgroundColor: '#1890ff' }}
                    />
                    <div style={{ marginTop: 12 }}>
                      {getRoleTag(userInfo.role)}
                    </div>
                  </div>
                </Col>
                
                <Col span={24} md={16}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary">邮箱地址</Text>
                      <div style={{ marginTop: 4 }}>
                        <Space>
                          <MailOutlined style={{ color: '#1890ff' }} />
                          <Text strong>{userInfo.email}</Text>
                        </Space>
                      </div>
                    </div>
                    
                    <div>
                      <Text type="secondary">注册时间</Text>
                      <div style={{ marginTop: 4 }}>
                        <Text>{userInfo.createdAt}</Text>
                      </div>
                    </div>
                  </Space>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* 用户名设置卡片 */}
          <Col span={24}>
            <Card 
              title={
                <Space>
                  <EditOutlined />
                  用户名设置
                </Space>
              }
              extra={
                !editing && (
                  <Button 
                    type="primary" 
                    icon={<EditOutlined />}
                    onClick={() => setEditing(true)}
                  >
                    修改用户名
                  </Button>
                )
              }
            >
              {!editing ? (
                <div>
                  <Text type="secondary">当前用户名</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 16 }}>
                      {userInfo.username || <Text type="secondary">未设置用户名</Text>}
                    </Text>
                  </div>
                  <Divider />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    用户名用于显示和识别您的身份，可以包含中文、字母、数字、下划线和横线
                  </Text>
                </div>
              ) : (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleUpdateUsername}
                  size="large"
                >
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 2, message: '用户名至少2个字符' },
                      { max: 50, message: '用户名不能超过50个字符' },
                      { 
                        pattern: /^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/, 
                        message: '用户名只能包含字母、数字、中文、下划线和横线' 
                      }
                    ]}
                  >
                    <Input 
                      placeholder="请输入用户名" 
                      prefix={<UserOutlined />}
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Space>
                      <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading}
                        icon={<SaveOutlined />}
                      >
                        保存修改
                      </Button>
                      <Button onClick={handleCancel}>
                        取消
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              )}
            </Card>
          </Col>

          {/* 密码设置卡片 */}
          <Col span={24}>
            <Card 
              title={
                <Space>
                  <KeyOutlined />
                  密码设置
                </Space>
              }
              extra={
                !editingPassword && (
                  <Button 
                    type="primary" 
                    icon={<LockOutlined />}
                    onClick={() => setEditingPassword(true)}
                  >
                    修改密码
                  </Button>
                )
              }
            >
              {!editingPassword ? (
                <div>
                  <Text type="secondary">密码安全</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 16 }}>
                      ••••••••••••
                    </Text>
                  </div>
                  <Divider />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    为了账户安全，建议定期更改密码。密码至少6位，不能包含空格
                  </Text>
                </div>
              ) : (
                <Form
                  form={passwordForm}
                  layout="vertical"
                  onFinish={handleUpdatePassword}
                  size="large"
                >
                  <Form.Item
                    name="currentPassword"
                    label="当前密码"
                    rules={[
                      { required: true, message: '请输入当前密码' }
                    ]}
                  >
                    <Input.Password 
                      placeholder="请输入当前密码" 
                      prefix={<LockOutlined />}
                    />
                  </Form.Item>

                  <Form.Item
                    name="newPassword"
                    label="新密码"
                    rules={[
                      { required: true, message: '请输入新密码' },
                      { min: 6, message: '密码至少6位' },
                      { pattern: /^[^\s]+$/, message: '密码不能包含空格' }
                    ]}
                  >
                    <Input.Password 
                      placeholder="请输入新密码（至少6位）" 
                      prefix={<LockOutlined />}
                    />
                  </Form.Item>

                  <Form.Item
                    name="confirmPassword"
                    label="确认新密码"
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: '请确认新密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('newPassword') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('两次输入的密码不一致'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password 
                      placeholder="请再次输入新密码" 
                      prefix={<LockOutlined />}
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Space>
                      <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={passwordLoading}
                        icon={<SaveOutlined />}
                      >
                        保存修改
                      </Button>
                      <Button onClick={handlePasswordCancel}>
                        取消
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default UserSettingsPage;
