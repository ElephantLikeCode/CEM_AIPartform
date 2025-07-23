import axios from 'axios';
import { message } from 'antd';

// 🔧 全局axios配置，统一处理401错误
let sessionExpiredShown = false;
let sessionExpiredTimeout: NodeJS.Timeout | null = null;

// 响应拦截器：统一处理401错误
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401错误：会话过期
    if (error.response?.status === 401) {
      // 防止重复显示会话过期消息
      if (!sessionExpiredShown) {
        sessionExpiredShown = true;
        
        // 显示会话过期消息（使用繁体中文匹配应用的主要语言）
        message.warning('會話已過期，請重新登入');
        
        // 重定向到登录页面
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
        
        // 5秒后重置标志，允许下次显示
        sessionExpiredTimeout = setTimeout(() => {
          sessionExpiredShown = false;
        }, 5000);
      }
    }
    
    return Promise.reject(error);
  }
);

// 重置会话过期标志的函数
export const resetSessionExpiredFlag = () => {
  sessionExpiredShown = false;
  if (sessionExpiredTimeout) {
    clearTimeout(sessionExpiredTimeout);
    sessionExpiredTimeout = null;
  }
};

export default axios;
