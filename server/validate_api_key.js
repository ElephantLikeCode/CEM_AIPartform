const axios = require('axios');

async function validateApiKey() {
  const apiKey = 'sk-7e1250deade74742b680615be1ddb141';
  
  console.log('🔍 验证DeepSeek API Key有效性...');
  console.log('🔑 使用的API Key:', apiKey);
  
  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: 'hello' }
      ],
      max_tokens: 5
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log('✅ API Key有效，DeepSeek服务正常');
    } else {
      console.log('⚠️ 意外的响应状态:', response.status);
    }
    
  } catch (error) {
    if (error.response) {
      console.error('❌ API Key验证失败');
      console.error('状态码:', error.response.status);
      console.error('错误信息:', error.response.data);
      
      if (error.response.status === 401) {
        console.error('🔑 认证失败，可能的原因：');
        console.error('  1. API Key不正确');
        console.error('  2. API Key已过期');
        console.error('  3. API Key权限不足');
        console.error('  请检查您的DeepSeek账户和API Key设置');
      } else if (error.response.status === 429) {
        console.error('🚫 请求频率过高，请稍后重试');
      }
    } else {
      console.error('❌ 网络错误:', error.message);
    }
  }
}

validateApiKey();
