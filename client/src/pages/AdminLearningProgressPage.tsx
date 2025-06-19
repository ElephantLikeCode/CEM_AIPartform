import React, { useEffect, useState } from 'react';
import { Table, Select, Input, Button, message } from 'antd';
import axios from 'axios';

const { Option } = Select;

const AdminLearningProgressPage: React.FC = () => {
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [tagId, setTagId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/learning/admin/all-progress', {
        params: { userId, tagId, page, pageSize }
      });
      if (res.data.success) {
        setProgress(res.data.data);
      } else {
        message.error('获取学习进度失败');
      }
    } catch (e) {
      message.error('获取学习进度失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
    // eslint-disable-next-line
  }, [userId, tagId, page]);

  return (
    <div style={{ padding: 24 }}>
      <h2>用户学习进度总览</h2>
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="按用户ID筛选"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          style={{ width: 180, marginRight: 8 }}
        />
        <Input
          placeholder="按标签ID筛选"
          value={tagId}
          onChange={e => setTagId(e.target.value)}
          style={{ width: 180, marginRight: 8 }}
        />
        <Button type="primary" onClick={() => setPage(1)}>
          查询
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={progress}
        pagination={{ current: page, pageSize, onChange: setPage }}
        columns={[
          { title: '用户ID', dataIndex: 'user_id' },
          { title: '用户名', dataIndex: 'username' },
          { title: '标签', dataIndex: 'tag_name' },
          { title: '文件', dataIndex: 'file_name' },
          { title: '当前阶段', dataIndex: 'current_stage' },
          { title: '总阶段', dataIndex: 'total_stages' },
          { title: '完成', dataIndex: 'completed', render: (v: any) => (v ? '✅' : '❌') },
          { title: '更新时间', dataIndex: 'updated_at' }
        ]}
      />
    </div>
  );
};

export default AdminLearningProgressPage;
