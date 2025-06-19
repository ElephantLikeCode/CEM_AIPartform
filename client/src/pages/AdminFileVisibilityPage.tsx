import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Select, message, Tag, Space } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

const AdminFileVisibilityPage: React.FC = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [visibleModal, setVisibleModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // 过滤掉管理员用户（他们已经可以看到全部文件）
  const getNonAdminUsers = () => {
    return users.filter(user => user.role !== 'admin');
  };

  // 创建用户ID到用户名的映射
  const getUserMap = () => {
    const userMap: { [key: number]: string } = {};
    users.forEach(user => {
      userMap[user.id] = user.username || user.email;
    });
    return userMap;
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/upload/list');
      if (res.data.success) setFiles(res.data.data);
    } finally {
      setLoading(false);
    }
  };
  const fetchUsers = async () => {
    const res = await axios.get('/api/admin/users');
    if (res.data.success) setUsers(res.data.data);
  };
  useEffect(() => {
    fetchFiles();
    fetchUsers();
  }, []);  const openEdit = (file: any) => {
    setEditingFile(file);
    // 过滤掉管理员账号的ID
    const nonAdminVisibleUserIds = (file.visibleUserIds || []).filter((userId: number) => {
      const user = users.find(u => u.id === userId);
      return user && user.role !== 'admin';
    });
    setSelectedUserIds(nonAdminVisibleUserIds);
    setVisibleModal(true);
  };

  const openView = (file: any) => {
    setViewingFile(file);
    setViewModal(true);
  };

  const handleSave = async () => {
    if (!editingFile) return;
    try {
      await axios.post('/api/upload/set-visibility', {
        fileId: editingFile.id,
        userIds: selectedUserIds
      });
      message.success('可见用户已更新');
      setVisibleModal(false);
      fetchFiles();
    } catch {
      message.error('设置失败');
    }
  };

  const userMap = getUserMap();
  const nonAdminUsers = getNonAdminUsers();

  return (
    <div style={{ padding: 24 }}>
      <h2>文件可见性管理</h2>      <Table
        rowKey="id"
        dataSource={files}
        loading={loading}
        columns={[
          { title: '文件名', dataIndex: 'originalName' },
          { title: '上传时间', dataIndex: 'uploadTime' },
          {
            title: '已分配可见用户',
            render: (_, file) => {
              const visibleUserIds = file.visibleUserIds || [];
              const nonAdminVisibleUsers = visibleUserIds.filter((userId: number) => {
                const user = users.find(u => u.id === userId);
                return user && user.role !== 'admin';
              });
              
              if (nonAdminVisibleUsers.length === 0) {
                return <span style={{ color: '#999' }}>未分配</span>;
              }
              
              return (
                <Button 
                  type="link" 
                  icon={<EyeOutlined />}
                  onClick={() => openView(file)}
                  style={{ padding: 0 }}
                >
                  {nonAdminVisibleUsers.length} 个用户
                </Button>
              );
            }
          },
          {
            title: '操作',
            render: (_, file) => (
              <Button onClick={() => openEdit(file)}>分配可见用户</Button>
            )
          }
        ]}
      />
      
      {/* 编辑可见用户弹窗 */}
      <Modal
        open={visibleModal}
        title="分配可见用户"
        onCancel={() => setVisibleModal(false)}
        onOk={handleSave}
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          value={selectedUserIds}
          onChange={setSelectedUserIds}
          placeholder="请选择可见用户（管理员默认可见全部文件）"
        >
          {nonAdminUsers.map((u: any) => (
            <Option key={u.id} value={u.id}>{u.username || u.email}</Option>
          ))}
        </Select>
      </Modal>

      {/* 查看可见用户弹窗 */}
      <Modal
        open={viewModal}
        title="已分配可见用户"
        onCancel={() => setViewModal(false)}
        footer={[
          <Button key="close" onClick={() => setViewModal(false)}>
            关闭
          </Button>
        ]}
      >
        {viewingFile && (
          <div>
            <p><strong>文件名：</strong>{viewingFile.originalName}</p>
            <p><strong>已分配的可见用户：</strong></p>
            <div style={{ marginTop: 12 }}>
              {(() => {
                const visibleUserIds = viewingFile.visibleUserIds || [];
                const nonAdminVisibleUsers = visibleUserIds.filter((userId: number) => {
                  const user = users.find(u => u.id === userId);
                  return user && user.role !== 'admin';
                });
                
                if (nonAdminVisibleUsers.length === 0) {
                  return <span style={{ color: '#999' }}>暂无分配的可见用户</span>;
                }
                
                return nonAdminVisibleUsers.map((userId: number) => (
                  <Tag key={userId} color="blue" style={{ marginBottom: 8, marginRight: 8 }}>
                    {userMap[userId] || `用户${userId}`}
                  </Tag>
                ));
              })()}
            </div>
            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f6f6f6', borderRadius: 4 }}>
              <small style={{ color: '#666' }}>
                注：管理员账号默认可见全部文件，无需单独分配
              </small>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminFileVisibilityPage;
