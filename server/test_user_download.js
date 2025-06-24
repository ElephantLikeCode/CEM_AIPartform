const axios = require('axios');

const testUserDownload = async () => {
  try {
    console.log('🔐 正在登录用户3 (495532414@qq.com)...');
    
    // 登录用户3
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: '495532414@qq.com',
      password: 'hello'  // 根据之前的测试，这个密码应该是正确的
    }, {
      withCredentials: true  // 确保 session cookie 被保存
    });
    
    console.log('✅ 登录成功:', loginResponse.data);
    
    // 检查用户权限
    const permissionResponse = await axios.get('http://localhost:3001/api/upload/debug-permissions/3', {
      withCredentials: true  // 携带 session cookie
    });
    
    console.log('🔍 用户权限详情:');
    console.log('可见文件IDs:', permissionResponse.data.data.visibleFileIds);
    console.log('权限详情:', permissionResponse.data.data.permissionDetails);
    
    // 尝试下载有权限的文件
    const filesWithPermission = permissionResponse.data.data.permissionDetails.filter(p => p.hasPermission);
    
    if (filesWithPermission.length > 0) {
      const testFile = filesWithPermission[0];
      console.log(`📥 尝试下载文件: ${testFile.fileName} (ID: ${testFile.fileId})`);
      
      const downloadResponse = await axios.get(`http://localhost:3001/api/upload/download/${testFile.fileId}`, {
        withCredentials: true,  // 携带 session cookie
        responseType: 'stream'
      });
      
      console.log('✅ 下载成功!', downloadResponse.status);
      console.log('响应头:', downloadResponse.headers);
    } else {
      console.log('❌ 用户没有任何文件权限');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
};

testUserDownload();
