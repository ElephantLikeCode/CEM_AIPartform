const axios = require('axios');

// 创建一个 axios 实例，配置 withCredentials 以携带 cookie
const apiClient = axios.create({
  baseURL: 'http://localhost:3001',
  withCredentials: true, // 这样可以自动携带 session cookie
});

const testDownload = async () => {
  try {
    console.log(`🔑 尝试登录用户3...`);
    const loginResponse = await apiClient.post('/api/auth/login', {
      email: '495532414@qq.com',
      password: '123456'
    });
    
    console.log('✅ 登录成功');
    console.log('完整登录响应:', JSON.stringify(loginResponse.data, null, 2));
    
    // 使用同一个 client 尝试下载文件，这样会自动携带 session cookie
    const fileId = 'file_mc080o19_mklbks'; // Report Guidelines.pdf
    console.log(`📥 尝试下载文件: ${fileId}`);
    
    const downloadResponse = await apiClient.get(`/api/upload/download/${fileId}`, {
      responseType: 'stream'
    });
    
    console.log('✅ 下载成功:', downloadResponse.status);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response ? error.response.data : error.message);
  }
};

testDownload();
