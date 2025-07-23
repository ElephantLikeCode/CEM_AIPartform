const axios = require('axios');

async function validateEnvApiKey() {
  const apiKey = 'sk-7e1250deade74742b680615be1ddb141';
  
  console.log('🔍 验证.env文件中的DeepSeek API Key...');
  console.log('🔑 API Key:', apiKey);
  
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
    
    console.log('✅ API Key有效，响应状态:', response.status);
    
  } catch (error) {
    if (error.response) {
      console.error('❌ API Key验证失败');
      console.error('状态码:', error.response.status);
      console.error('错误详情:', error.response.data);
    } else {
      console.error('❌ 网络错误:', error.message);
      console.error('错误代码:', error.code);
    }
  }
}

validateEnvApiKey();
