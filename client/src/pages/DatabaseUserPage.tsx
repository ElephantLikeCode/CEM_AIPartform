import React, { useEffect, useState } from 'react';
import { Table, Button, Spin, message, Typography, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

interface FileItem {
  id: string;
  name: string;
  size: number;
  updated_at?: string;
  uploadTime?: string;
}

const DatabaseUserPage: React.FC = () => {
  const { t } = useTranslation(['database', 'common']);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);

  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/learning/materials');
        if (res.data.success) {
          setFiles(res.data.data);
        } else {
          message.error(t('database:fetch_failed', '获取文件列表失败'));
        }
      } catch (e) {
        message.error(t('database:fetch_failed', '获取文件列表失败'));
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [t]);
  const handleDownload = async (file: FileItem) => {
    try {
      const res = await axios.get(`/api/upload/download/${file.id}`, {
        responseType: 'blob',
      });
      
      // 检查是否成功下载文件
      if (res.status === 200 && res.data instanceof Blob) {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', file.name);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);
        message.success(t('database:download_success', '下载成功'));
      } else {
        message.error(t('database:download_failed', '下载失败'));
      }
    } catch (error: any) {
      console.error('下载错误:', error);
      if (error.response) {
        if (error.response.status === 403) {
          message.error(t('database:permission_denied', '无权限下载该文件'));
        } else if (error.response.status === 404) {
          message.error(t('database:file_not_found', '文件不存在'));
        } else {
          message.error(error.response.data?.message || t('database:download_failed', '下载失败'));
        }
      } else {
        message.error(t('database:download_failed', '下载失败'));
      }
    }
  };

  const columns = [
    {
      title: t('database:file_name', '文件名'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('database:file_size', '大小'),
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => `${(size / 1024).toFixed(2)} KB`,
    },
    {
      title: t('database:upload_time', '上传时间'),
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      render: (date: string) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: t('database:action', '操作'),
      key: 'action',
      render: (_: any, record: FileItem) => (
        <Button
          icon={<DownloadOutlined />}
          onClick={() => handleDownload(record)}
        >
          {t('database:download', '下载')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>{t('database:user_title', '我的资料库')}</Title>
      {loading ? (
        <Spin />
      ) : files.length === 0 ? (
        <Empty description={t('database:no_files', '暂无可用文件')} />
      ) : (
        <Table
          dataSource={files}
          columns={columns}
          rowKey="id"
          pagination={false}
        />
      )}
    </div>
  );
};

export default DatabaseUserPage;
