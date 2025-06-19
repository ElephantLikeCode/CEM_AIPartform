import React, { useEffect, useState } from 'react';
import { Table, Button, Select, message } from 'antd';
import axios from 'axios';

const { Option } = Select;

const AdminTagFileOrderPage: React.FC = () => {
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTag, setSelectedTag] = useState<number | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get('/api/tags').then(res => {
      if (res.data.success) setTags(res.data.data);
    });
  }, []);
  useEffect(() => {
    if (selectedTag) {
      setLoading(true);
      axios.get(`/api/tags/${selectedTag}/files`).then(res => {
        if (res.data.success) {
          setFiles(res.data.data);
          setOrder(res.data.data.map((f: any) => f.id));
        }
        setLoading(false);
      });
    }
  }, [selectedTag]);

  const handleOrderChange = (id: number, direction: 'up' | 'down') => {
    const idx = order.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...order];
    if (direction === 'up' && idx > 0) {
      [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    } else if (direction === 'down' && idx < newOrder.length - 1) {
      [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
    }
    setOrder(newOrder);
  };
  const handleSave = async () => {
    if (!selectedTag) return;
    try {
      await axios.post('/api/tags/set-file-order', {
        tagId: selectedTag,
        fileIdOrder: order
      });
      message.success('顺序已保存');
    } catch {
      message.error('保存失败');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>标签下文件排序管理</h2>
      <Select
        style={{ width: 240, marginBottom: 16 }}
        placeholder="选择标签"
        onChange={setSelectedTag}
        value={selectedTag || undefined}
      >
        {tags.map((t: any) => (
          <Option key={t.id} value={t.id}>{t.name}</Option>
        ))}
      </Select>      <Table
        rowKey={(record: any) => `${record.id || record.file_id}`}
        dataSource={(() => {
          const uniqueFiles: any[] = [];
          const seen = new Set();
          for (const id of order) {
            if (id && !seen.has(id)) {
              const f = files.find((f: any) => f.id === id || f.file_id === id);
              if (f) {
                // 兼容 original_name/originalName
                if (f.original_name && !f.originalName) f.originalName = f.original_name;
                uniqueFiles.push(f);
                seen.add(id);
              }
            }
          }
          return uniqueFiles;
        })()}
        loading={loading}
        pagination={false}
        columns={[
          { title: '文件名', dataIndex: 'originalName' },
          {
            title: '顺序',
            render: (_, file: any) => {
              const idx = order.indexOf(file.id || file.file_id);
              return (
                <>
                  <Button size="small" onClick={() => handleOrderChange(file.id || file.file_id, 'up')} disabled={idx === 0}>上移</Button>
                  <Button size="small" onClick={() => handleOrderChange(file.id || file.file_id, 'down')} disabled={idx === order.length - 1} style={{ marginLeft: 8 }}>下移</Button>
                </>
              );
            }
          }
        ]}
      />
      <Button type="primary" onClick={handleSave} style={{ marginTop: 16 }}>保存顺序</Button>
    </div>
  );
};

export default AdminTagFileOrderPage;
