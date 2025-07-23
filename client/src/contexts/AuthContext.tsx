import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { resetSessionExpiredFlag } from '../utils/axiosConfig';

interface AuthContextType {
  userLoggedIn: boolean;
  userRole: string;
  authChecking: boolean;
  checkLoginStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [userLoggedIn, setUserLoggedIn] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [authChecking, setAuthChecking] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  const checkLoginStatus = useCallback(async () => {
    const currentPath = location.pathname;
    const isPublicPage = currentPath === '/welcome' || currentPath === '/login';
    
    // 🔧 如果已经登录或者在公共页面，不需要检查
    if (userLoggedIn || isPublicPage) {
      return;
    }
    
    // 🔧 如果正在检查中，避免重复调用
    if (authChecking) {
      return;
    }
    
    setAuthChecking(true);
    try {
      const response = await axios.get('/api/auth/check-login', {
        withCredentials: true
      });
      
      setUserLoggedIn(response.data.loggedIn);
      setUserRole(response.data.role || 'user');
      
      // 🔧 如果用户成功登录，重置会话过期标志
      if (response.data.loggedIn) {
        resetSessionExpiredFlag();
      }
      
      // 🔧 如果用户未登录且不在公共页面，重定向到登录页面
      // 不再显示消息，由全局拦截器处理
      if (!response.data.loggedIn && !isPublicPage) {
        navigate('/login', { replace: true });
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
      setUserLoggedIn(false);
      setUserRole('user');
      
      // 🔧 网络或服务器错误时，重定向到登录页面
      // 不再显示消息，由全局拦截器处理
      if (!isPublicPage) {
        navigate('/login', { replace: true });
      }
    } finally {
      setAuthChecking(false);
    }
  }, [location.pathname, navigate, userLoggedIn, authChecking]); // 🔧 移除t依赖项

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const response = await axios.post('/api/auth/logout', {}, { withCredentials: true });
      
      if (response.data.success) {
        message.success(t('auth.logoutSuccess'));
        setUserLoggedIn(false);
        setUserRole('user');
        resetSessionExpiredFlag(); // 🔧 重置会话过期标志
        navigate('/welcome');
      } else {
        throw new Error(response.data.message || '登出失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message || '登出失败');
    } finally {
      setLoggingOut(false);
    }
  }, [navigate, t]);

  // 🔧 优化：只在路径变化时检查登录状态，避免不必要的重复检查
  useEffect(() => {
    const currentPath = location.pathname;
    const isPublicPage = currentPath === '/welcome' || currentPath === '/login';
    
    // 只在访问需要认证的页面时检查登录状态
    if (!isPublicPage) {
      checkLoginStatus();
    }
  }, [location.pathname, checkLoginStatus]);

  return (
    <AuthContext.Provider
      value={{
        userLoggedIn,
        userRole,
        authChecking,
        checkLoginStatus,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
