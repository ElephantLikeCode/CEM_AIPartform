import React, { useEffect, useState } from 'react';
import { Table, Card, Statistic, Row, Col, message, Tag, Typography, Spin, Empty } from 'antd';
import { BookOutlined, TrophyOutlined, ClockCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

interface LearningRecord {
  id: number;
  file_id: string;
  filename: string;
  current_stage: number;
  total_stages: number;
  completed: boolean;
  test_score?: number;
  created_at: string;
  updated_at: string;
}

interface UserStats {
  totalLearning: number;
  completedLearning: number;
  learningCompletion: number;
  avgTestScore?: number;
  lastActivity?: string;
}

const MyLearningRecordsPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [learningRecords, setLearningRecords] = useState<LearningRecord[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  // 获取用户统计信息
  const fetchUserStats = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.success) {
        setUserStats(response.data.data.learningStats);
      }
    } catch (error) {
      console.error('获取用户统计失败:', error);
    }
  };

  // 获取学习记录
  const fetchMyRecords = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/learning/my-records');
      if (response.data.success) {
        setLearningRecords(response.data.data.learningProgress || []);
      } else {
        message.error('获取学习记录失败');
      }
    } catch (error) {
      console.error('获取学习记录失败:', error);
      message.error('获取学习记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserStats();
    fetchMyRecords();
  }, []);

  // 学习记录表格列
  const learningColumns = [
    {
      title: '学习材料',
      dataIndex: 'filename',
      key: 'filename',
      render: (text: string) => (
        <div>
          <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          {text || '未知文件'}
        </div>
      )
    },
    {
      title: '学习进度',
      key: 'progress',
      render: (record: LearningRecord) => (
        <div>
          <Text>{record.current_stage}/{record.total_stages} 阶段</Text>
          <div style={{ marginTop: 4 }}>
            <div 
              style={{ 
                width: '100px', 
                height: '6px', 
                backgroundColor: '#f0f0f0', 
                borderRadius: '3px',
                overflow: 'hidden'
              }}
            >
              <div 
                style={{ 
                  width: `${(record.current_stage / record.total_stages) * 100}%`, 
                  height: '100%', 
                  backgroundColor: record.completed ? '#52c41a' : '#1890ff',
                  transition: 'width 0.3s'
                }} 
              />
            </div>
          </div>
        </div>
      )
    },
    {
      title: '完成状态',
      dataIndex: 'completed',
      key: 'completed',
      render: (completed: boolean) => (
        <Tag color={completed ? 'success' : 'processing'}>
          {completed ? '已完成' : '进行中'}
        </Tag>
      )
    },
    {
      title: '测试分数',
      dataIndex: 'test_score',
      key: 'test_score',
      render: (score: number) => {
        if (score === null || score === undefined) return <Text type="secondary">未测试</Text>;
        const color = score >= 80 ? '#52c41a' : score >= 60 ? '#faad14' : '#ff4d4f';
        return <Text style={{ color, fontWeight: 'bold' }}>{score}分</Text>;
      }
    },
    {
      title: '开始时间',
      dataIndex: 'created_at',
      key: 'created_at'
    },
    {
      title: '最后更新',
      dataIndex: 'updated_at',
      key: 'updated_at'
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <BookOutlined style={{ marginRight: 8 }} />
        我的学习记录
      </Title>

      {/* 统计卡片 */}
      {userStats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card>
              <Statistic
                title="学习材料总数"
                value={userStats.totalLearning}
                prefix={<BookOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="完成率"
                value={userStats.learningCompletion}
                suffix="%"
                prefix={<TrophyOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="平均学习分数"
                value={userStats.avgTestScore || 0}
                suffix="分"
                prefix={<TrophyOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {userStats?.lastActivity && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <ClockCircleOutlined style={{ fontSize: 16, marginRight: 8, color: '#1890ff' }} />
            <Text>最后学习活动时间: {userStats.lastActivity}</Text>
          </div>
        </Card>
      )}

      {/* 学习记录表格 */}
      <Card>
        <Title level={3} style={{ marginBottom: 16 }}>
          学习进度记录 ({learningRecords.length})
        </Title>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
          </div>
        ) : learningRecords.length > 0 ? (
          <Table
            columns={learningColumns}
            dataSource={learningRecords}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`
            }}
          />
        ) : (
          <Empty 
            description="暂无学习记录" 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Card>
    </div>
  );
};

export default MyLearningRecordsPage;
