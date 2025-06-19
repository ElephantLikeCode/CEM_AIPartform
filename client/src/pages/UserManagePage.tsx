import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  message, 
  Popconfirm, 
  Tag, 
  Space, 
  Card, 
  Typography,
  Select,
  Tooltip,
  Row,
  Col,
  Statistic
} from 'antd';
import { 
  UserOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  CrownOutlined,
  KeyOutlined,
  ExclamationCircleOutlined,
  SafetyOutlined,
  ReloadOutlined,
  TeamOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;

interface User {
  id: number;
  email: string;
  username?: string;
  role: string;
  created_at: string;
}

const UserManagePage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'password' | 'role'>('password');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState('user');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchUsers();
    getCurrentUserInfo();
  }, []);

  // 获取当前用户信息
  const getCurrentUserInfo = async () => {
    try {
      const response = await axios.get('/api/auth/user', { withCredentials: true });
      if (response.data.success) {
        setCurrentUserRole(response.data.data.role);
        setCurrentUserId(response.data.data.id);
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  };

  // 获取用户列表
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/users', { withCredentials: true });
      if (response.data.success) {
        setUsers(response.data.data);
      } else {
        message.error(response.data.message || '获取用户列表失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除用户
  const handleDeleteUser = async (userId: number) => {
    try {
      const response = await axios.delete(`/api/admin/users/${userId}`, { withCredentials: true });
      if (response.data.success) {
        message.success('用户删除成功');
        fetchUsers();
      } else {
        message.error(response.data.message || '删除用户失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除用户失败');
    }
  };

  // 修改密码
  const handleChangePassword = async (values: { password: string; confirmPassword: string }) => {
    if (!selectedUser) return;

    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    try {
      const response = await axios.put(`/api/admin/users/${selectedUser.id}/password`, 
        { password: values.password }, 
        { withCredentials: true }
      );
      
      if (response.data.success) {
        message.success('密码修改成功');
        setModalVisible(false);
        form.resetFields();
      } else {
        message.error(response.data.message || '修改密码失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '修改密码失败');
    }
  };

  // 修改用户角色
  const handleChangeRole = async (values: { role: string }) => {
    if (!selectedUser) return;

    try {
      const response = await axios.put(`/api/admin/users/${selectedUser.id}/role`, 
        { role: values.role }, 
        { withCredentials: true }
      );
      
      if (response.data.success) {
        message.success('用户角色修改成功');
        setModalVisible(false);
        form.resetFields();
        fetchUsers();
      } else {
        message.error(response.data.message || '修改用户角色失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '修改用户角色失败');
    }
  };

  // 打开修改密码模态框
  const openPasswordModal = (user: User) => {
    setSelectedUser(user);
    setModalType('password');
    setModalVisible(true);
    form.resetFields();
  };

  // 打开修改角色模态框
  const openRoleModal = (user: User) => {
    setSelectedUser(user);
    setModalType('role');
    setModalVisible(true);
    form.setFieldsValue({ role: user.role });
  };

  // 检查是否可以操作用户
  const canOperateUser = (user: User) => {
    // 不能操作自己
    if (user.id === currentUserId) return false;
    
    // 超级管理员可以操作所有用户（除了自己）
    if (currentUserRole === 'admin') return true;
    
    // 二级管理员不能操作管理员
    if (currentUserRole === 'sub_admin' && (user.role === 'admin' || user.role === 'sub_admin')) return false;
    
    return true;
  };

  // 检查是否可以修改角色
  const canChangeRole = (user: User) => {
    // 只有超级管理员可以修改角色
    return currentUserRole === 'admin' && user.id !== currentUserId;
  };

  // 获取角色标签
  const getRoleTag = (role: string) => {
    switch (role) {
      case 'admin':
        return <Tag color="red" icon={<CrownOutlined />}>超级管理员</Tag>;
      case 'sub_admin':
        return <Tag color="orange" icon={<SafetyOutlined />}>二级管理员</Tag>;
      default:
        return <Tag color="blue" icon={<UserOutlined />}>普通用户</Tag>;
    }
  };

  // 获取统计信息
  const getStatistics = () => {
    const adminCount = users.filter(user => user.role === 'admin').length;
    const subAdminCount = users.filter(user => user.role === 'sub_admin').length;
    const userCount = users.filter(user => user.role === 'user').length;
    
    return { adminCount, subAdminCount, userCount, totalCount: users.length };
  };

  const stats = getStatistics();

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      sorter: (a: User, b: User) => a.id - b.id,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (email: string, record: User) => (
        <div>
          <Text copyable={{ text: email }} style={{ marginRight: 8 }}>
            {email}
          </Text>
          {record.id === currentUserId && (
            <Tag color="green" >当前用户</Tag>
          )}
        </div>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => username || <Text type="secondary">-</Text>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => getRoleTag(role),
      filters: [
        { text: '超级管理员', value: 'admin' },
        { text: '二级管理员', value: 'sub_admin' },
        { text: '普通用户', value: 'user' },
      ],
      onFilter: (value: any, record: User) => record.role === value,
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
      sorter: (a: User, b: User) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, user: User) => (
        <Space size="small">
          <Tooltip title={user.id === currentUserId ? "不能修改自己的密码" : "修改密码"}>
            <Button
              type="text"
              icon={<KeyOutlined />}
              size="small"
              disabled={!canOperateUser(user)}
              onClick={() => openPasswordModal(user)}
            />
          </Tooltip>
          
          <Tooltip title={user.id === currentUserId ? "不能修改自己的角色" : "修改角色"}>
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              disabled={!canChangeRole(user)}
              onClick={() => openRoleModal(user)}
            />
          </Tooltip>
          
          <Tooltip title={user.id === currentUserId ? "不能删除自己" : "删除用户"}>
            <Popconfirm
              title="确认删除"
              description={
                <div>
                  <p>确定要删除用户 <strong>{user.email}</strong> 吗？</p>
                  <p style={{ color: 'red', margin: 0 }}>此操作不可恢复！</p>
                </div>
              }
              onConfirm={() => handleDeleteUser(user.id)}
              okText="确定"
              cancelText="取消"
              okType="danger"
              icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
              disabled={!canOperateUser(user)}
            >
              <Button
                type="text"
                icon={<DeleteOutlined />}
                size="small"
                danger
                disabled={!canOperateUser(user)}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      {/* 页面头部 */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">
              <UserOutlined />
              用户管理
            </h1>
            <p className="page-description">
              管理平台用户账户和权限，支持密码重置、角色分配等功能
            </p>
          </div>
          <img 
            src="https://www.cem-macau.com/_nuxt/img/logo.5ab12fa.svg" 
            alt="CEM Logo" 
            style={{ height: '32px', opacity: 0.6 }}
          />
        </div>
      </div>

      {/* 统计卡片 */}      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" styles={{ body: { padding: '20px' } }}>
            <Statistic
              title={<span style={{ color: '#666', fontSize: '14px' }}>总用户数</span>}
              value={stats.totalCount}
              prefix={<TeamOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontSize: '28px', fontWeight: '600' }}
            />
          </Card>        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" styles={{ body: { padding: '20px' } }}>
            <Statistic
              title={<span style={{ color: '#666', fontSize: '14px' }}>超级管理员</span>}
              value={stats.adminCount}
              prefix={<CrownOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: '#f5222d', fontSize: '28px', fontWeight: '600' }}
            />
          </Card>        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" styles={{ body: { padding: '20px' } }}>
            <Statistic
              title={<span style={{ color: '#666', fontSize: '14px' }}>二级管理员</span>}
              value={stats.subAdminCount}
              prefix={<SafetyOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16', fontSize: '28px', fontWeight: '600' }}
            />
          </Card>        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" styles={{ body: { padding: '20px' } }}>
            <Statistic
              title={<span style={{ color: '#666', fontSize: '14px' }}>普通用户</span>}
              value={stats.userCount}
              prefix={<UserOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: '28px', fontWeight: '600' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 主要内容 */}
      <Card>
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              <UserOutlined style={{ marginRight: '8px' }} />
              用户管理
            </Title>
            <Text type="secondary">管理平台用户账户和权限</Text>
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchUsers}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>
        
        <Table
          columns={columns.map(col => ({
            ...col,
            render: col.render ? col.render : (text) => (
              <span style={{ fontSize: '14px' }}>{text}</span>
            )
          }))}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            total: users.length,
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => (
              <span style={{ color: '#666' }}>
                第 {range[0]}-{range[1]} 条，共 {total} 个用户
              </span>
            ),
            pageSizeOptions: ['10', '20', '50', '100'],
            size: 'default'
          }}
          scroll={{ x: 1000 }}
          rowClassName={(record) => 
            record.id === currentUserId ? 'current-user-row' : ''
          }
          size="middle"
        />
      </Card>      {/* 修改密码/角色模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            {modalType === 'password' ? (
              <>
                <KeyOutlined style={{ color: '#1890ff' }} />
                修改用户密码
              </>
            ) : (
              <>
                <EditOutlined style={{ color: '#1890ff' }} />
                修改用户角色
              </>
            )}
          </div>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={480}
        destroyOnHidden
        style={{ top: 100 }}
        className="user-manage-modal"
      >        {selectedUser && (
          <div 
            className="user-info-display"
            style={{ 
              marginBottom: '24px', 
              padding: '16px', 
              background: '#f8f9fa', 
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}
          >
            <Space direction="vertical" size={8}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text type="secondary">目标用户：</Text>
                <Text strong style={{ fontSize: '15px' }}>{selectedUser.email}</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text type="secondary">当前角色：</Text>
                {getRoleTag(selectedUser.role)}
              </div>
            </Space>
          </div>
        )}

        {modalType === 'password' ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleChangePassword}
            size="large"
          >
            <Form.Item
              name="password"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少6位' },
                { pattern: /^[^\s]+$/, message: '密码不能包含空格' }
              ]}
            >
              <Input.Password placeholder="请输入新密码（至少6位）" />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="确认密码"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="请再次输入密码" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setModalVisible(false)}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit">
                  确定修改
                </Button>
              </Space>
            </Form.Item>
          </Form>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleChangeRole}
            size="large"
          >
            <Form.Item
              name="role"
              label="用户角色"
              rules={[{ required: true, message: '请选择用户角色' }]}
            >
              <Select placeholder="请选择用户角色" size="large">
                <Option value="user">
                  <Space>
                    <UserOutlined style={{ color: '#1890ff' }} />
                    普通用户
                  </Space>
                </Option>
                <Option value="sub_admin">
                  <Space>
                    <SafetyOutlined style={{ color: '#fa8c16' }} />
                    二级管理员
                  </Space>
                </Option>
                <Option value="admin">
                  <Space>
                    <CrownOutlined style={{ color: '#f5222d' }} />
                    超级管理员
                  </Space>
                </Option>
              </Select>
            </Form.Item>

            <div style={{ marginBottom: '16px', padding: '12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: '6px' }}>
              <Text type="warning" style={{ fontSize: '12px' }}>
                <ExclamationCircleOutlined style={{ marginRight: '4px' }} />
                注意：修改用户角色将立即生效，请谨慎操作
              </Text>
            </div>

            <Form.Item style={{ marginBottom: 0 }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setModalVisible(false)}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit">
                  确定修改
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 自定义样式 */}
      <style>
        {`
          .current-user-row {
            background-color: #e6f7ff !important;
            border-left: 3px solid #1890ff;
          }
          .current-user-row:hover {
            background-color: #e6f7ff !important;
          }
          .stats-card .ant-statistic-title {
            margin-bottom: 8px;
          }
          .stats-card .ant-statistic-content {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        `}
      </style>
    </div>
  );
};

export default UserManagePage;
