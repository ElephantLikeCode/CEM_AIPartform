const axios = require('axios');

const testDownload = async () => {
  const passwords = ['hello', '123456', 'password', 'user123', '495532414', 'user'];
  
  for (const password of passwords) {
    try {
      console.log(`🔑 尝试密码: ${password}`);
      const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
        email: '495532414@qq.com',
        password: password
      });      console.log('✅ 登录成功 with password:', password);
      console.log('完整登录响应:', JSON.stringify(loginResponse.data, null, 2));
      const token = loginResponse.data.token;
      
      // 使用token尝试下载文件
      const fileId = 'file_mc080o19_mklbks'; // Report Guidelines.pdf
      console.log(`📥 尝试下载文件: ${fileId}`);
      
      const downloadResponse = await axios.get(`http://localhost:3001/api/upload/download/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        responseType: 'stream'
      });
      
      console.log('✅ 下载成功:', downloadResponse.status);
      return;
      
    } catch (error) {
      if (error.response?.data?.message === '邮箱或密码错误') {
        console.log(`❌ 密码错误: ${password}`);
        continue;
      } else {
        console.error('❌ 其他错误:', error.response ? error.response.data : error.message);
        return;
      }
    }
  }
  
  console.log('❌ 所有密码都尝试失败');
};

testDownload();
