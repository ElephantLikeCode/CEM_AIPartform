import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Upload, Button, Table, Card, message, Progress, Tag, 
  Modal, Descriptions, List, Typography, Space, Tooltip,
  Popconfirm, Input, Select, Empty, Divider, ColorPicker, Form,
  Checkbox, Dropdown, Menu
} from 'antd';
import { 
  UploadOutlined, DeleteOutlined, EyeOutlined, 
  ReloadOutlined, RobotOutlined, FileTextOutlined,
  ClockCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  SearchOutlined, FilterOutlined, TagsOutlined, PlusOutlined,
  EditOutlined, ApiOutlined, ThunderboltOutlined, DownOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { debounce } from 'lodash';
import { useTranslation } from 'react-i18next';
import AIModelSwitcher from '../components/AIModelSwitcher';
import { useAIModel } from '../contexts/AIModelContext';

const { Dragger } = Upload;
const { Text, Paragraph } = Typography;
const { Search } = Input;
const { Option } = Select;

interface FileItem {
  id: string;
  originalName: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  uploadTime: string;
  uploadTimestamp?: number;
  relativeTime?: string;
  processedTime?: string;
  size: string;
  formattedSize: string;
  fileType: string;
  hasAIResults: boolean;
  aiSummary?: string;
  stages: number;
  keyPoints: number;
  estimatedTime: string;
  error?: string;
  tags: TagItem[]; // 🏷️ 新增：文件标签
}

// 🏷️ 新增：标签接口
interface TagItem {
  id: number;
  name: string;
  description: string;
  color: string;
  fileCount?: number;
  created_at: string;
}

// 文件状态标签组件
const FileStatusTag: React.FC<{ status: string; error?: string }> = ({ status, error }) => {
  const statusConfig = {
    uploaded: { color: 'blue', icon: <UploadOutlined />, text: '已上傳' },
    processing: { color: 'orange', icon: <RobotOutlined spin />, text: 'AI分析中' },
    completed: { color: 'green', icon: <CheckCircleOutlined />, text: '分析完成' },
    failed: { color: 'red', icon: <ExclamationCircleOutlined />, text: '處理失敗' }
  };
  
  const config = statusConfig[status as keyof typeof statusConfig];
  
  return (
    <Tooltip title={error || config.text}>
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    </Tooltip>
  );
};

// 新增：格式化时间显示的辅助函数
const formatTimeDisplay = (uploadTime: string, uploadTimestamp?: number, relativeTime?: string) => {
  // 如果有相对时间，显示相对时间
  if (relativeTime) {
    return (
      <Tooltip title={uploadTime}>
        <Text type="secondary">{relativeTime}</Text>
      </Tooltip>
    );
  }
  
  // 如果有时间戳，使用时间戳格式化
  if (uploadTimestamp) {
    const date = new Date(uploadTimestamp);
    const formattedDate = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    return (
      <Tooltip title={`完整时间: ${formattedDate}`}>
        <Text type="secondary">{formattedDate}</Text>
      </Tooltip>
    );
  }
  
  // 尝试解析上传时间字符串
  try {
    const date = new Date(uploadTime);
    if (!isNaN(date.getTime())) {
      const formattedDate = date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      return (
        <Tooltip title={`上传时间: ${formattedDate}`}>
          <Text type="secondary">{formattedDate}</Text>
        </Tooltip>
      );
    }
  } catch (error) {
    console.warn('时间格式解析失败:', uploadTime);
  }
  
  // 如果所有方法都失败，显示原始字符串
  return (
    <Tooltip title={uploadTime}>
      <Text type="secondary">{uploadTime}</Text>
    </Tooltip>
  );
};

const DatabasePage = () => {
  const { t } = useTranslation();
  const { currentModel } = useAIModel(); // 🤖 新增：获取当前AI模型
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sortField, setSortField] = useState<string>('uploadTime');
  const [sortDirection, setSortDirection] = useState<'ascend' | 'descend'>('descend');
  
  // 🔧 新增：移动端检测
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 🏷️ 新增：标签管理相关状态
  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [tagForm] = Form.useForm();
  
  // 🏷️ 新增：文件标签操作相关状态
  const [fileTagModalVisible, setFileTagModalVisible] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<number | null>(null); // 🔧 改为单标签模式
  const [filterTag, setFilterTag] = useState<number | null>(null);
    // 🤖 新增：AI分析相关状态
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [batchAnalysisProgress, setBatchAnalysisProgress] = useState(0);
  
  const isFetchingFiles = useRef(false);

  // 简化文件名处理 - 服务器端已经处理好编码
  const normalizeFileName = (fileName: string) => {
    if (!fileName) return fileName;
    
    // 检查文件名是否正常显示中文
    if (/[\u4e00-\u9fa5]/.test(fileName) && !fileName.includes('�')) {
      return fileName;
    }
    
    // 尝试简单的解码
    try {
      return decodeURIComponent(fileName);
    } catch (error) {
      return fileName;
    }
  };
  // 🏷️ 新增：获取标签列表
  const fetchTags = useCallback(async () => {
    try {
      const response = await axios.get('/api/tags');
      if (response.data.success) {
        const newTags = response.data.data || [];
        setTags(newTags);
        console.log('✅ 标签列表获取成功:', newTags.length, '个');
          // 🔧 修复：检查当前筛选的标签是否还存在，如果不存在则清除筛选
        if (filterTag && !newTags.some((tag: TagItem) => tag.id === filterTag)) {
          console.log('🔄 当前筛选的标签已被删除，清除筛选状态');
          setFilterTag(null);
        }
      }
    } catch (error) {
      console.error('获取标签列表失败:', error);
      message.error('获取标签列表失败');
    }
  }, [filterTag]);

  // 獲取文件列表 - 使用useCallback优化
  const fetchFiles = useCallback(async () => {
    if (isFetchingFiles.current) return;
    isFetchingFiles.current = true;

    setLoading(true);
    try {
      const response = await axios.get('/api/upload/files');
      const filesData = response.data.data || [];
      
      // 简化处理 - 服务器端已经规范化了文件名
      const processedFiles = filesData.map((file: FileItem) => ({
        ...file,
        originalName: normalizeFileName(file.originalName),
        tags: file.tags || [] // 确保标签数组存在
      }));
      
      setFiles(processedFiles);
    } catch (error) {
      message.error('獲取檔案清單失敗');
      console.error('获取文件失败:', error);
    } finally {
      setLoading(false);
      isFetchingFiles.current = false;
    }
  }, []);
  useEffect(() => {
    fetchFiles();
    fetchTags(); // 🏷️ 获取标签列表
    // 每5秒刷新一次狀態 - 只刷新文件列表，标签不需要频繁刷新
    const interval = setInterval(fetchFiles, 5000);
    return () => clearInterval(interval);
  }, []); // 移除函数依赖，避免重复请求

  // 🏷️ 新增：创建或更新标签
  const handleSaveTag = async (values: any) => {
    try {
      const { name, description, color } = values;
      
      if (editingTag) {
        // 更新标签
        const response = await axios.put(`/api/tags/${editingTag.id}`, {
          name: name.trim(),
          description: description?.trim() || '',
          color: typeof color === 'string' ? color : color?.toHexString?.() || '#1890ff'
        });
        
        if (response.data.success) {
          message.success('标签更新成功');
          await fetchTags();
          await fetchFiles(); // 刷新文件列表以更新标签信息
        }
      } else {
        // 创建新标签
        const response = await axios.post('/api/tags', {
          name: name.trim(),
          description: description?.trim() || '',
          color: typeof color === 'string' ? color : color?.toHexString?.() || '#1890ff'
        });
        
        if (response.data.success) {
          message.success('标签创建成功');
          await fetchTags();
        }
      }
      
      setTagModalVisible(false);
      setEditingTag(null);
      tagForm.resetFields();
    } catch (error: any) {
      console.error('保存标签失败:', error);
      message.error(error.response?.data?.message || '保存标签失败');
    }
  };
  // 🏷️ 新增：删除标签
  const handleDeleteTag = async (tagId: number) => {
    try {
      // 查找要删除的标签信息
      const tagToDelete = tags.find(tag => tag.id === tagId);
      if (!tagToDelete) {
        message.error('标签不存在');
        return;
      }

      // 检查是否有文件使用此标签
      const filesWithTag = files.filter(file => 
        file.tags.some(tag => tag.id === tagId)
      );

      if (filesWithTag.length > 0) {
        // 有文件使用此标签，需要用户确认
        Modal.confirm({
          title: '确认删除标签',
          content: (
            <div>
              <p>标签 <strong>"{tagToDelete.name}"</strong> 正在被 <strong>{filesWithTag.length}</strong> 个文件使用。</p>
              <p style={{ color: '#fa8c16' }}>删除此标签将：</p>
              <ul style={{ marginLeft: 16, color: '#666' }}>
                <li>永久删除标签本身</li>
                <li>从所有相关文件中移除此标签</li>
                <li>此操作不可撤销</li>
              </ul>
              <p>您确定要继续吗？</p>
            </div>
          ),
          icon: <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />,
          okText: '确定删除',
          okType: 'danger',
          cancelText: '取消',
          width: 480,
          onOk: async () => {
            await performTagDeletion(tagId, tagToDelete.name);
          }
        });
      } else {
        // 没有文件使用此标签，直接删除
        Modal.confirm({
          title: '确认删除标签',
          content: `确定要删除标签 "${tagToDelete.name}" 吗？此操作不可撤销。`,
          icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
          okText: '确定删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            await performTagDeletion(tagId, tagToDelete.name);
          }
        });
      }
    } catch (error: any) {
      console.error('删除标签操作失败:', error);
      message.error('删除标签操作失败');
    }
  };  // 执行标签删除的实际操作
  const performTagDeletion = async (tagId: number, tagName: string) => {
    try {
      // 🔧 修复：在删除前就清除筛选，避免显示已删除的标签
      const wasFiltering = filterTag === tagId;
      if (wasFiltering) {
        setFilterTag(null);
        console.log('🔄 预先清除即将删除标签的筛选状态');
      }
      
      // 使用强制删除来移除文件关联
      const response = await axios.delete(`/api/tags/${tagId}?force=true`);
      if (response.data.success) {
        message.success(`标签 "${tagName}" 删除成功`);
        
        // 显示筛选清除提示（如果之前有筛选）
        if (wasFiltering) {
          message.info('已自動清除被刪除標籤的篩選條件');
        }
        
        // 刷新数据
        await fetchTags();
        await fetchFiles(); // 刷新文件列表以移除标签关联
      }
    } catch (error: any) {
      console.error('删除标签失败:', error);
      message.error(error.response?.data?.message || '删除标签失败');
    }
  };

  // 🏷️ 新增：打开标签编辑模态框
  const openTagModal = (tag?: TagItem) => {
    if (tag) {
      setEditingTag(tag);
      tagForm.setFieldsValue({
        name: tag.name,
        description: tag.description,
        color: tag.color
      });
    } else {
      setEditingTag(null);
      tagForm.resetFields();
    }
    setTagModalVisible(true);
  };

  // 🏷️ 修改：打开文件标签编辑模态框 - 单标签模式
  const openFileTagModal = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      setEditingFileId(fileId);
      // 🔧 单标签模式：只取第一个标签的ID，如果没有标签则为null
      setSelectedTags(file.tags.length > 0 ? file.tags[0].id : null);
      setFileTagModalVisible(true);
    }
  };

  // 🏷️ 修改：保存文件标签 - 单标签模式
  const handleSaveFileTags = async () => {
    if (!editingFileId) return;
    
    try {
      const response = await axios.put(`/api/upload/files/${editingFileId}/tags`, {
        tagId: selectedTags // 🔧 改为单个标签ID
      });
      
      if (response.data.success) {
        message.success('文件标签更新成功');
        await fetchFiles(); // 刷新文件列表
        await fetchTags(); // 🏷️ 修复：刷新标签列表以更新计数
        setFileTagModalVisible(false);
        setEditingFileId(null);
        setSelectedTags(null); // 🔧 重置为null
      }
    } catch (error: any) {
      console.error('更新文件标签失败:', error);
      message.error(error.response?.data?.message || '更新文件标签失败');
    }
  };

  // 文件上傳配置
  const uploadProps = useMemo(() => ({
    name: 'file',
    action: '/api/upload/files',
    accept: '.pdf,.doc,.docx,.txt,.md',
    showUploadList: false,
    headers: {
      'Content-Type': 'multipart/form-data; charset=UTF-8'
    },
    beforeUpload: (file: File) => {
      // 检查文件名是否包含中文字符
      const hasChinese = /[\u4e00-\u9fa5]/.test(file.name);
      if (hasChinese) {
        console.log('✅ 检测到中文文件名:', file.name);
      }
      
      const validTypes = ['application/pdf',
                          'application/msword',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/vnd.ms-powerpoint', // PPT文件
                          'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX文件
                          'text/plain',
                          'text/markdown'];

                          
      const isValidType = validTypes.includes(file.type) || 
                         file.name.endsWith('.md') || file.name.endsWith('.txt');
      
      if (!isValidType) {
        message.error('只支援 PPT，PDF, Word, TXT, Markdown 檔案！');
        return false;
      }
      
      const isLt50M = file.size / 1024 / 1024 < 50;
      if (!isLt50M) {
        message.error('檔案大小不能超過 50MB！');
        return false;
      }
      
      return true;
    },
    onChange: (info: any) => {
      if (info.file.status === 'uploading') {
        setUploading(true);
      } else if (info.file.status === 'done') {
        setUploading(false);
        setUploadProgress(0);
        message.success(`檔案 "${info.file.name}" 上傳成功，AI分析開始！`);
        fetchFiles();
      } else if (info.file.status === 'error') {
        setUploading(false);
        setUploadProgress(0);
        message.error(`檔案 "${info.file.name}" 上傳失敗！`);
      }
    },
    customRequest: async (options: any) => {
      const { file, onSuccess, onError, onProgress } = options;
      
      const formData = new FormData();
      formData.append('file', file, file.name);
      
      try {
        const response = await axios.post('/api/upload/files', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress({ percent });
              setUploadProgress(percent);
            }
          }
        });
        
        onSuccess(response.data, file);
      } catch (error) {
        console.error('文件上传失败:', error);
        onError(error);
      }
    }
  }), [fetchFiles]);

  // 查看文件詳情
  const viewFileDetails = useCallback(async (fileId: string) => {
    try {
      const response = await axios.get(`/api/upload/files/${fileId}`);
      setSelectedFile(response.data.data);
      setDetailModalVisible(true);
    } catch (error) {
      message.error('獲取檔案詳情失敗');
    }
  }, []);  // 重新處理文件
  const reprocessFile = useCallback(async (fileId: string) => {
    try {
      // 🤖 修复：传递当前选择的AI模型
      await axios.post(`/api/upload/files/${fileId}/reprocess`, {
        model: currentModel
      });
      message.success('檔案重新分析已開始');
      fetchFiles();
    } catch (error) {
      message.error('重新分析失敗');
    }
  }, [fetchFiles, currentModel]);

  // 刪除文件
  const deleteFile = useCallback(async (fileId: string) => {
    try {
      await axios.delete(`/api/upload/files/${fileId}`);
      message.success('檔案刪除成功');
      fetchFiles();
    } catch (error) {
      message.error('檔案刪除失敗');
    }
  }, [fetchFiles]);

  // 使用防抖优化搜索
  const debouncedSearch = useMemo(
    () => debounce((value: string) => {
      setSearchText(value);
    }, 300),
    []
  );

  // 搜索处理
  const handleSearch = (value: string) => {
    debouncedSearch(value);
  };

  // 过滤后的文件列表 - 🏷️ 增加标签筛选
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const nameMatch = searchText ? 
        file.originalName.toLowerCase().includes(searchText.toLowerCase()) : 
        true;
      
      const statusMatch = filterStatus ? 
        file.status === filterStatus : 
        true;
      
      // 🏷️ 新增：标签筛选
      const tagMatch = filterTag ? 
        file.tags.some(tag => tag.id === filterTag) : 
        true;
      
      return nameMatch && statusMatch && tagMatch;
    }).sort((a, b) => {
      // 基础排序
      if (sortField === 'uploadTime') {
        // 优先使用时间戳排序，其次使用字符串时间
        const timeA = a.uploadTimestamp || new Date(a.uploadTime).getTime() || 0;
        const timeB = b.uploadTimestamp || new Date(b.uploadTime).getTime() || 0;
        return sortDirection === 'ascend' ? timeA - timeB : timeB - timeA;
      }
      if (sortField === 'originalName') {
        return sortDirection === 'ascend' 
          ? a.originalName.localeCompare(b.originalName)
          : b.originalName.localeCompare(a.originalName);
      }
      return 0;
    });
  }, [files, searchText, filterStatus, filterTag, sortField, sortDirection]);

  // 表格列定義 - 🏷️ 增加标签列
  const columns = useMemo(() => [
    {
      title: '檔案名',
      dataIndex: 'originalName',
      key: 'originalName',
      sorter: true,
      sortOrder: sortField === 'originalName' ? sortDirection : null,
      render: (name: string, record: FileItem) => (
        <Space direction="vertical" size={0}>
          <Space>
            <FileTextOutlined />
            <Text strong title={name}>{name}</Text>
            {record.hasAIResults && <Tag color="blue">已分析</Tag>}
          </Space>
          {/* 🏷️ 新增：显示文件标签 */}
          {record.tags.length > 0 && (
            <Space wrap size={4} style={{ marginTop: 4 }}>
              {record.tags.map(tag => (
                <Tag key={tag.id} color={tag.color} style={{ fontSize: 11 }}>
                  {tag.name}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      )
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: '已上傳', value: 'uploaded' },
        { text: 'AI分析中', value: 'processing' },
        { text: '分析完成', value: 'completed' },
        { text: '處理失敗', value: 'failed' }
      ],
      filteredValue: filterStatus ? [filterStatus] : null,
      render: (status: string, record: FileItem) => (
        <FileStatusTag status={status} error={record.error} />
      )
    },
    {
      title: 'AI分析摘要',
      dataIndex: 'aiSummary', 
      key: 'aiSummary',
      render: (summary: string) => (
        <Paragraph ellipsis={{ rows: 2 }} style={{ maxWidth: 300, margin: 0 }}>
          {summary || '等待AI分析...'}
        </Paragraph>
      )
    },
    {
      title: '學習資訊',
      key: 'learningInfo',
      render: (record: FileItem) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary">段落: {record.stages}</Text>
          <Text type="secondary">要點: {record.keyPoints}</Text>
        </Space>
      )
    },
    {
      title: '檔案資訊',
      key: 'fileInfo',
      render: (record: FileItem) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary">{record.formattedSize}</Text>
          <Text type="secondary">{record.fileType}</Text>
          {formatTimeDisplay(record.uploadTime, record.uploadTimestamp, record.relativeTime)}
        </Space>
      ),
      sorter: true,
      sortOrder: sortField === 'uploadTime' ? sortDirection : null,
    },
    {      title: '操作',
      key: 'actions',
      render: (record: FileItem) => (
        <Space direction="vertical" size="small">
          <Space>
            <Button 
              size="small" 
              icon={<EyeOutlined />}
              onClick={() => viewFileDetails(record.id)}
            >
              詳情
            </Button>            {/* 🏷️ 新增：标签管理按钮 */}
            <Button 
              size="small" 
              icon={<TagsOutlined />}
              onClick={() => openFileTagModal(record.id)}
            >
              標籤
            </Button>
          </Space>          
          <Space>
            {/* 🔧 修复：所有文件都可以重新分析，processing状态也可以重试 */}
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={() => reprocessFile(record.id)}
              disabled={false} // 允许所有状态的文件重新分析
            >
              {record.status === 'failed' ? '重試' : record.status === 'processing' ? '重試' : '重新分析'}
            </Button>
            <Popconfirm
              title="確定要刪除這個檔案嗎？"
              onConfirm={() => deleteFile(record.id)}
              okText="確定"
              cancelText="取消"
            >
              <Button 
                size="small" 
                danger 
                icon={<DeleteOutlined />}
              >
                刪除
              </Button>
            </Popconfirm>
          </Space>
        </Space>
      )
    }
  ], [viewFileDetails, reprocessFile, deleteFile, sortField, sortDirection, filterStatus, openFileTagModal]);
  // 处理表格排序和筛选变化
  const handleTableChange = useCallback((_pagination: any, filters: any, sorter: any) => {
    if (sorter && sorter.field) {
      setSortField(sorter.field);
      setSortDirection(sorter.order || 'descend');
    }
    
    if (filters && filters.status) {
      setFilterStatus(filters.status[0]);
    } else {
      setFilterStatus(null);
    }
  }, []);

  const renderEmptyState = useCallback(() => {
    if (searchText || filterStatus || filterTag) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span>
              沒有找到符合條件的檔案
              <br />
              <Button type="link" onClick={() => {
                setSearchText('');
                setFilterStatus(null);
                setFilterTag(null);
              }}>
                清除篩選條件
              </Button>
            </span>
          }
        />
      );
    }
    
    return (
      <Card style={{ textAlign: 'center', padding: '40px 0' }}>
        <FileTextOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 16 }} />
        <Text type="secondary" style={{ fontSize: 16 }}>
          還沒有上傳任何檔案
          <br />
          上傳您的第一個學習文檔開始AI智能學習之旅
        </Text>
      </Card>
    );
  }, [searchText, filterStatus, filterTag]);
  // 🤖 删除DeepSeek相关功能，只保留总开关控制
  // AI分析功能现在由总开关统一控制
  return (
    <div>
      {/* 🤖 新增：AI模型切换器 */}
      <AIModelSwitcher />
        <Card title={t('database.title')} extra={
        <Space direction={isMobile ? "vertical" : "horizontal"} size={isMobile ? "small" : "middle"}>
          {/* 🏷️ 新增：标签管理按钮 */}          <Button 
            icon={<TagsOutlined />} 
            onClick={() => openTagModal()}
            size={isMobile ? "small" : "middle"}
          >
            {isMobile ? "新增" : "新增標籤"}
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchFiles}
            size={isMobile ? "small" : "middle"}
          >
            {isMobile ? "刷新" : "重新整理清單"}
          </Button>
        </Space>
      }>
        {/* 🏷️ 新增：标签管理区域 */}
        {tags.length > 0 && (
          <Card size="small" style={{ marginBottom: 16 }} title={
            <Space>
              <TagsOutlined />
              <span>標籤管理</span>
              <Text type="secondary">({tags.length}個)</Text>
            </Space>
          }>
            <Space wrap>
              {tags.map(tag => (
                <Tag 
                  key={tag.id} 
                  color={tag.color}
                  style={{ 
                    marginBottom: 4,
                    cursor: 'pointer',
                    border: filterTag === tag.id ? '2px solid #1890ff' : 'none'
                  }}
                  onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
                >
                  <Space>
                    <span>{tag.name}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      ({tag.fileCount || 0})
                    </Text>                    <Button 
                      type="text" 
                      size="small" 
                      icon={<EditOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        openTagModal(tag);
                      }}
                      style={{ padding: 0, fontSize: 10 }}
                    /><Popconfirm
                      title={`確定要刪除標籤"${tag.name}"嗎？`}
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        handleDeleteTag(tag.id);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="確定"
                      cancelText="取消"
                    >
                      <Button 
                        type="text" 
                        size="small" 
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        style={{ padding: 0, fontSize: 10 }}
                      />
                    </Popconfirm>
                  </Space>
                </Tag>
              ))}
            </Space>
            {filterTag && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  點擊標籤可篩選文件，再次點擊取消篩選
                </Text>
                <Button 
                  type="link" 
                  size="small"
                  onClick={() => setFilterTag(null)}
                  style={{ padding: 0, marginLeft: 8 }}
                >
                  清除篩選
                </Button>
              </div>
            )}
          </Card>
        )}

        <Dragger {...uploadProps} style={{ marginBottom: 24 }}>
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text">點擊或拖拽檔案到此區域上傳</p>
          <p className="ant-upload-hint">
            支援 PDF, Word, TXT, Markdown 格式，最大 50MB
            <br />
            檔案將自動通過AI進行內容分析和知識提取
            <br />
            <Text type="secondary">
              💡 上傳檔案後，等待AI分析完成即可在學習介面中使用
            </Text>
          </p>
        </Dragger>

        {uploading && (
          <Card style={{ marginBottom: 16 }}>
            <Progress percent={uploadProgress} status="active" />
            <Text>檔案上傳中，請稍候...</Text>
          </Card>
        )}        
        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: isMobile ? '8px 12px' : '12px 16px' } }}>
          <Space 
            style={{ width: '100%' }} 
            direction={isMobile ? "vertical" : "horizontal"}
            size={isMobile ? "small" : "middle"}
          >            <Search
              placeholder={t('database.searchPlaceholder')}
              allowClear
              onSearch={handleSearch}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: isMobile ? '100%' : 300 }}
              prefix={<SearchOutlined />}
            />
            <Space 
              wrap 
              size="small"
              style={{ width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-start' }}
            >
              <Tooltip title="按狀態篩選">
                <Select 
                  placeholder="按狀態篩選" 
                  allowClear
                  style={{ width: isMobile ? 'calc(50% - 4px)' : 150 }}
                  onChange={(value) => setFilterStatus(value)}
                  value={filterStatus}
                  suffixIcon={<FilterOutlined />}
                >
                  <Option value="uploaded">已上傳</Option>
                  <Option value="processing">AI分析中</Option>
                  <Option value="completed">分析完成</Option>
                  <Option value="failed">處理失敗</Option>
                </Select>
              </Tooltip>
              {/* 🏷️ 新增：标签筛选下拉框 */}              
              <Tooltip title="按標籤篩選">
                <Select 
                  placeholder="按標籤篩選" 
                  allowClear
                  style={{ width: isMobile ? 'calc(50% - 4px)' : 150 }}
                  onChange={(value) => setFilterTag(value)}
                  value={filterTag}
                  suffixIcon={<TagsOutlined />}
                  // 🔧 修复：确保只显示存在的标签选项
                  onClear={() => setFilterTag(null)}
                >
                  {tags.map(tag => (
                    <Option key={tag.id} value={tag.id}>
                      <Tag color={tag.color} style={{ marginRight: 4 }}>
                        {tag.name}
                      </Tag>
                    </Option>
                  ))}
                </Select>
              </Tooltip>
            </Space>
          </Space>
        </Card>

        {filteredFiles.length === 0 ? (
          renderEmptyState()
        ) : (
          <Table
            dataSource={filteredFiles}
            columns={columns}
            rowKey="id"
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: Math.floor(filteredFiles.length / 10) + 1,
              pageSize: 10,
              total: filteredFiles.length,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `總共 ${total} 個檔案`,            }}
            scroll={{ x: 800 }}
            size="small"
          />
        )}
      </Card>      {/* 文件詳情模態框 */}
      <Modal
        title={t('database.fileDetails')}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={isMobile ? '95vw' : 800}
        style={{ top: isMobile ? 20 : 20 }}
        centered={isMobile}
        className="file-detail-modal"
      >{selectedFile && (
          <div>
            <Descriptions 
              bordered 
              column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }} 
              style={{ marginBottom: 16 }}
              size="small"
            >
              <Descriptions.Item label="檔案名">
                {normalizeFileName(selectedFile.originalName)}
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <FileStatusTag status={selectedFile.status} error={selectedFile.error} />
              </Descriptions.Item>
              <Descriptions.Item label="檔案大小">{selectedFile.formattedSize}</Descriptions.Item>
              <Descriptions.Item label="上傳時間">
                {formatTimeDisplay(selectedFile.uploadTime, selectedFile.uploadTimestamp, selectedFile.relativeTime)}
              </Descriptions.Item>
              <Descriptions.Item label="處理時間">
                {selectedFile.processedTime ? 
                  selectedFile.processedTime : 
                  (selectedFile.status === 'completed' ? '處理完成' : '未完成')
                }
              </Descriptions.Item>
              <Descriptions.Item label="檔案類型">{selectedFile.fileType}</Descriptions.Item>
            </Descriptions>

            {/* 🏷️ 新增：文件标签显示 */}
            {selectedFile.tags && selectedFile.tags.length > 0 && (
              <Card size="small" style={{ marginBottom: 16 }} title="文件標籤">
                <Space wrap>
                  {selectedFile.tags.map((tag: TagItem) => (
                    <Tag key={tag.id} color={tag.color}>
                      {tag.name}
                    </Tag>
                  ))}
                </Space>
              </Card>
            )}

            {selectedFile.aiAnalysis && (
              <div>
                <Card title="AI智能分析摘要" size="small" style={{ marginBottom: 16 }}>
                  <div style={{ 
                    background: '#f0f9ff', 
                    padding: 16, 
                    borderRadius: 6,
                    marginBottom: 12,
                    borderLeft: '4px solid #1890ff'
                  }}>
                    <Text style={{ color: '#1890ff', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                      📚 智能課程概述
                    </Text>
                    <Paragraph style={{ margin: 0, lineHeight: 1.6 }}>
                      {selectedFile.aiAnalysis.summary}
                    </Paragraph>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    ✨ 此內容已由AI智能分析並重新組織，轉換為適合學習的格式
                  </Text>
                </Card>

                {/* ...existing code for AI analysis display... */}                {selectedFile.aiAnalysis.statistics && (
                  <Card title="文檔統計" size="small">
                    <Descriptions column={{ xs: 1, sm: 2, md: 2, lg: 4, xl: 4 }} size="small">
                      <Descriptions.Item label="詞數">{selectedFile.aiAnalysis.statistics.words}</Descriptions.Item>
                      <Descriptions.Item label="句數">{selectedFile.aiAnalysis.statistics.sentences}</Descriptions.Item>
                      <Descriptions.Item label="段數">{selectedFile.aiAnalysis.statistics.paragraphs}</Descriptions.Item>
                      <Descriptions.Item label="閱讀時間">{selectedFile.aiAnalysis.statistics.estimatedReadingTime}分鐘</Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>      {/* 🏷️ 新增：标签创建/编辑模态框 */}
      <Modal
        title={editingTag ? '編輯標籤' : '新增標籤'}
        open={tagModalVisible}
        onCancel={() => {
          setTagModalVisible(false);
          setEditingTag(null);
          tagForm.resetFields();
        }}        onOk={() => tagForm.submit()}
        okText="保存"
        cancelText="取消"
        className="tag-modal"
        width={isMobile ? '90vw' : 480}
        centered={isMobile}
      >
        <Form
          form={tagForm}
          layout="vertical"
          onFinish={handleSaveTag}
        >
          <Form.Item
            name="name"
            label="標籤名稱"
            rules={[{ required: true, message: '請輸入標籤名稱' }]}
          >
            <Input placeholder="輸入標籤名稱" />
          </Form.Item>
          <Form.Item
            name="description"
            label="標籤描述"
          >
            <Input.TextArea placeholder="輸入標籤描述（可選）" rows={2} />
          </Form.Item>
          <Form.Item
            name="color"
            label="標籤顏色"
            initialValue="#1890ff"
          >
            <ColorPicker showText />
          </Form.Item>
        </Form>
      </Modal>      {/* 🏷️ 修改：文件标签编辑模态框 - 单标签模式 */}
      <Modal
        title="編輯文件標籤"
        open={fileTagModalVisible}
        onCancel={() => {
          setFileTagModalVisible(false);
          setEditingFileId(null);
          setSelectedTags(null); // 🔧 重置为null
        }}
        onOk={handleSaveFileTags}
        okText="保存"
        cancelText="取消"
        className="tag-modal"
        width={isMobile ? '90vw' : 520}
        centered={isMobile}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>選擇標籤 (每個文件只能設置一個標籤)：</Text>
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder="選擇文件標籤"
          value={selectedTags}
          onChange={setSelectedTags}
          optionLabelProp="label"
          allowClear
        >
          {tags.map(tag => (
            <Option 
              key={tag.id} 
              value={tag.id}
              label={
                <Space>
                  <Tag color={tag.color}>{tag.name}</Tag>
                </Space>
              }
            >
              <Space>
                <Tag color={tag.color}>{tag.name}</Tag>
                {tag.description && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {tag.description}
                  </Text>
                )}
              </Space>
            </Option>
          ))}
        </Select>
        {selectedTags && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已選擇標籤: {tags.find(tag => tag.id === selectedTags)?.name}
            </Text>
          </div>
        )}
      </Modal>      {/* 🤖 AI分析功能已移除，现在由总开关统一控制 */}

      <Card style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Space size="large">
              <span>
                <FileTextOutlined style={{ marginRight: 8 }} />
                檔案數據庫 ({filteredFiles.length} 個檔案)
              </span>
              {searchText || filterStatus || filterTag ? (
                <Button 
                  size="small" 
                  onClick={() => {
                    setSearchText('');
                    setFilterStatus(null);
                    setFilterTag(null);
                  }}
                >
                  清除篩選                </Button>
              ) : null}
            </Space>
          </div>
        </Card>
    </div>
  );
};

export default DatabasePage;
