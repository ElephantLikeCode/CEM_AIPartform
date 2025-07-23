import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, message, Spin, Avatar, Drawer } from 'antd';
import { DatabaseOutlined, BookOutlined, QuestionCircleOutlined, UserOutlined, LogoutOutlined, SafetyOutlined, BulbOutlined, MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined, HistoryOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import axios from 'axios';
import './utils/axiosConfig'; // 🔧 导入axios全局配置
import './App.css';
import './styles/theme.css';

import WelcomePage from './pages/WelcomePage';
import DatabasePage from './pages/DatabasePage';
import LearningPage from './pages/LearningPage';
import QuizPage from './pages/QuizPage';
import QuizMenuPage from './pages/QuizMenuPage';
import LoginPage from './pages/LoginPage';
import UserManagePage from './pages/UserManagePage';
import QAPage from './pages/QAPage';
import AdminLearningProgressPage from './pages/AdminLearningProgressPage';
import AdminFileVisibilityPage from './pages/AdminFileVisibilityPage';
import AdminTagFileOrderPage from './pages/AdminTagFileOrderPage';
import MyLearningRecordsPage from './pages/MyLearningRecordsPage';
import UserSettingsPage from './pages/UserSettingsPage';
import LanguageSwitcher from './components/LanguageSwitcher';
import { GenerationProvider, useGeneration, GenerationLock } from './contexts/GenerationContext';
import { AIModelProvider } from './contexts/AIModelContext';
import { AuthProvider } from './contexts/AuthContext';
import DatabaseUserPage from './pages/DatabaseUserPage';
import AppFooter from './components/AppFooter'; // 引入Footer

const { Header, Content, Sider } = Layout;

// 受保护的路由组件 - 简化版，依赖于AppContent的登录状态检查
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

// 定义菜单项类型
interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const AppContent: React.FC = () => {
  const { t } = useTranslation();
  const { userLoggedIn, userRole, authChecking, checkLoginStatus, logout } = useAuth();
  const [apiStatus, setApiStatus] = useState<string>('Checking...');
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  
  // 🔧 新增：移动端状态管理 - 初始化时立即检测屏幕尺寸
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // 在组件初始化时立即检测屏幕尺寸，避免刷新时的布局闪烁
    return typeof window !== 'undefined' ? window.innerWidth < 1200 : false;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean | undefined>(() => {
    // 根据初始屏幕尺寸设置侧边栏状态
    return typeof window !== 'undefined' ? window.innerWidth < 1200 : undefined;
  });
  
  // 🔧 新增：生成状态管理
  const { isGenerationLocked, generationState } = useGeneration();  // 🔧 新增：检测移动端设备
  useEffect(() => {
    const checkMobile = () => {
      // 修改逻辑：1200px以下都使用抽屉模式（移动端逻辑）
      const shouldUseMobileMode = window.innerWidth < 1200;
      const desktop = window.innerWidth >= 1200;
      
      setIsMobile(shouldUseMobileMode);
      
      // 响应式侧边栏控制逻辑
      if (shouldUseMobileMode) {
        // 移动端/平板端：强制收起，使用抽屉模式
        setSidebarCollapsed(true);
      } else if (desktop) {
        // 桌面端：默认展开侧边栏
        setSidebarCollapsed(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 检查是否在欢迎页面或登录页面
  const isWelcomePage = location.pathname === '/welcome';
  const isLoginPage = location.pathname === '/login';
  const isRootPage = location.pathname === '/';
  const isPublicPage = isWelcomePage || isLoginPage || isRootPage;  // API健康检查 - 只在组件挂载时执行一次
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setApiStatus('API Connected');
        console.log('API Health:', data);
      })
      .catch(err => {
        setApiStatus('API Failed');
        console.error('API Error:', err);
      });
  }, []); // 空依赖数组，只执行一次

  // 🔧 移除重复的会话检查 - 现在完全由 AuthContext 处理
  // useEffect(() => {
  //   if (!isPublicPage) {
  //     checkLoginStatus();
  //   }
  // }, [location.pathname, isPublicPage, checkLoginStatus]);

  // 登出处理函数
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      // 错误处理已在 AuthContext 中处理
    } finally {
      setLoggingOut(false);
    }
  };
  
  const userMenu = {
    items: [
      {
        key: 'settings',
        icon: <UserOutlined />,
        label: '个人设置',
        onClick: () => navigate('/settings')
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: t('common.logout'),
        onClick: handleLogout
      }
    ]
  };

  // 根据用户角色动态生成菜单项
  // 根据当前路径获取选中的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/database') return 'database';
    if (path === '/users') return 'users';
    if (path === '/learning') return 'learning';
    if (path === '/my-records') return 'my-records';
    if (path === '/qa') return 'qa';
    if (path === '/quiz-menu' || path === '/quiz') return 'quiz';
    if (path === '/admin/learning-progress') return 'admin-learning-progress';
    if (path === '/admin/file-visibility') return 'admin-file-visibility';
    if (path === '/admin/tag-file-order') return 'admin-tag-file-order';
    
    // 默认选择
    return userRole === 'admin' || userRole === 'sub_admin' ? 'database' : 'learning';
  };  const getMenuItems = (): MenuItem[] => {
    const items: MenuItem[] = [];
    
    // 🔧 新增：生成锁定时阻止导航的函数
    const handleNavigation = (path: string) => {
      if (isGenerationLocked()) {
        message.warning(t('notification.warning'));
        return;
      }
      navigate(path);
    };
    
    // 管理员可以看到数据库管理和用户管理
    if (userRole === 'admin' || userRole === 'sub_admin') {
      items.push({
        key: 'database',
        icon: <DatabaseOutlined />,
        label: t('nav.database', '知识库'),
        onClick: () => navigate('/database')
      });
      
      items.push({
        key: 'users',
        icon: <UserOutlined />,
        label: t('admin.userManagement'),
        onClick: () => handleNavigation('/users')
      });
    }
    // 普通用户显示只读数据库页面
    if (userRole === 'user') {
      items.push({
        key: 'database',
        icon: <DatabaseOutlined />,
        label: t('nav.database', '知识库'),
        onClick: () => navigate('/database')
      });
    }
    // 仅 admin 可见的管理功能
    if (userRole === 'admin') {
      items.push({
        key: 'admin-learning-progress',
        icon: <SafetyOutlined />,
        label: t('admin.analytics'),
        onClick: () => handleNavigation('/admin/learning-progress')
      });
      items.push({
        key: 'admin-file-visibility',
        icon: <SafetyOutlined />,
        label: t('admin.fileManagement'),
        onClick: () => handleNavigation('/admin/file-visibility')
      });
      items.push({
        key: 'admin-tag-file-order',
        icon: <SafetyOutlined />,
        label: t('admin.systemSettings'),
        onClick: () => handleNavigation('/admin/tag-file-order')
      });
    }
    // 所有用户都可以看到学习和测验
    items.push(
      {
        key: 'learning',
        icon: <BookOutlined />,
        label: t('nav.learning'),
        onClick: () => handleNavigation('/learning')
      },
      {
        key: 'my-records',
        icon: <HistoryOutlined />,
        label: '我的学习记录',
        onClick: () => handleNavigation('/my-records')
      },
      {
        key: 'qa',
        icon: <BulbOutlined />,
        label: t('menu.aiQA'),
        onClick: () => handleNavigation('/qa')
      },
      {
        key: 'quiz',
        icon: <QuestionCircleOutlined />,
        label: t('nav.quiz'),
        onClick: () => handleNavigation('/quiz-menu')
      }
    );
    
    return items;
  };
  // 如果在欢迎页面或登录页面，显示简单布局
  if (isPublicPage) {
    return (
      <div style={{ margin: 0, padding: 0 }}>        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          {/* 根路径重定向到欢迎页面 */}
          <Route path="/" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    );
  }

  // 如果正在检查认证状态或用户未登录，显示加载页面
  if (authChecking || !userLoggedIn) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        background: '#f0f2f5'
      }}>
        <Spin size="large" />        <div style={{ marginTop: '16px', fontSize: '16px', color: '#666' }}>
          {authChecking ? t('status.checkingLogin') : t('status.redirectingToLogin')}
        </div>
      </div>
    );
  }

  return (
    <GenerationLock>
      <Layout style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header style={{ 
          color: 'white', 
          fontSize: isMobile ? '18px' : '22px',
          fontWeight: 'bold', 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '72px',
          background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          position: 'fixed', /* 固定定位 */
          top: 0,
          left: 0,
          width: '100%',
          zIndex: 1000,
          padding: isMobile ? '0 12px' : '0 24px',
          boxSizing: 'border-box'
        }}>
          {/* Header content remains the same */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px' }}>
          <img 
            src="https://www.cem-macau.com/_nuxt/img/logo.5ab12fa.svg" 
            alt="CEM Logo"
            style={{ height: isMobile ? '32px' : '40px', width: 'auto' }}
          />          {!isMobile && (
            <span style={{ fontSize: '20px', fontWeight: '600' }}>
              {t('common.title')}
            </span>
          )}
        </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '20px' }}>
          {/* 隐藏状态信息
          <div style={{ 
            fontSize: '14px', 
            background: 'rgba(255,255,255,0.2)',
            padding: '4px 12px',
            borderRadius: '16px',
            backdropFilter: 'blur(10px)'
          }}>
            狀態: {apiStatus}
          </div>
          */}          
          {/* 🔧 新增：生成状态显示 */}
          {isGenerationLocked() && (
            <div style={{ 
              fontSize: '14px', 
              background: '#faad14',
              padding: '4px 12px',
              borderRadius: '16px',
              color: 'white',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>              <Spin size="small" style={{ color: 'white' }} />
              {generationState.generationType === 'tag' ? t('common.tagQuestions') : t('common.documentQuestions')}
            </div>
          )}          {userLoggedIn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>              {/* 语言切换器 */}
              <LanguageSwitcher 
                size={isMobile ? 'small' : 'middle'}
                style={{ 
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '6px'
                }}
              />
              
              {/* 统一的侧边栏控制按钮 */}
              <Button 
                type="text" 
                icon={
                  isMobile 
                    ? <MenuOutlined />
                    : (sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)
                }                onClick={() => {
                  if (isMobile) {
                    // 移动端/中等尺寸：打开抽屉
                    setSidebarCollapsed(false);
                  } else {
                    // 大屏桌面端：切换侧边栏
                    setSidebarCollapsed(!sidebarCollapsed);
                  }
                }}
                style={{ 
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '6px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: isMobile ? '0 8px' : '0 12px',
                  minWidth: isMobile ? '36px' : 'auto'
                }}                title={
                  isMobile 
                    ? t('common.settings') 
                    : (sidebarCollapsed ? t('common.settings') : t('common.settings'))
                }
              >
                {!isMobile && (sidebarCollapsed ? t('common.settings') : t('common.close'))}              </Button>
              
              {/* 隐藏用户角色信息
              <div style={{ 
                fontSize: '12px', 
                background: userRole === 'admin' ? '#52c41a' : userRole === 'sub_admin' ? '#fa8c16' : '#1890ff',
                padding: '4px 10px',
                borderRadius: '12px',
                color: 'white',
                fontWeight: '500'
              }}>
                {userRole === 'admin' ? '超级管理員' : userRole === 'sub_admin' ? '二级管理员' : '用戶'}
              </div>
              */}              <Dropdown menu={userMenu} placement="bottomRight">
                <Button 
                  type="text" 
                  icon={<UserOutlined />}
                  loading={loggingOut}
                  style={{ 
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '6px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: isMobile ? '0 8px' : '0 16px'
                  }}
                >
                  {isMobile ? '' : t('nav.profile')}
                </Button>
              </Dropdown>
            </div>
          )}
        </div>
      </Header>
      <Layout style={{ display: 'flex', flexDirection: 'row', marginTop: '72px' }}>
        {/* Sider remains the same */}
        {!isMobile && (
          <Sider 
            width={240}
            collapsedWidth={0}
            collapsed={sidebarCollapsed ?? false}
            style={{ 
              background: '#fff',
              boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
              borderRight: '1px solid #f0f0f0',
              transition: 'width 0.2s ease',
              overflow: 'hidden',
              position: 'fixed', /* 固定定位 */
              top: '72px', /* 在Header下方 */
              left: 0,
              height: 'calc(100vh - 72px)', /* 高度为viewport减去Header高度 */
              zIndex: 999
            }}
          >
            {/* Sider content remains the same */}
            <div style={{ 
              padding: '24px 16px 16px',
              borderBottom: '1px solid #f0f0f0',
              textAlign: 'center'
            }}>
              <Avatar 
                size={48} 
                icon={<UserOutlined />} 
                style={{ 
                  background: userRole === 'admin' ? '#52c41a' : userRole === 'sub_admin' ? '#fa8c16' : '#1890ff' 
                }} 
              />
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                {userRole === 'admin' ? t('role.admin') : userRole === 'sub_admin' ? t('role.subAdmin') : t('role.user')}
              </div>
            </div>
            <Menu
              mode="inline"
              selectedKeys={[getSelectedKey()]}
              style={{ 
                height: 'calc(100vh - 144px)', 
                borderRight: 0,
                background: 'transparent',
                fontSize: '15px',
                padding: '16px 0'
              }}
              items={getMenuItems().map(item => ({
                key: item.key,
                icon: item.icon,
                label: item.label,
                onClick: item.onClick,
                style: { 
                  height: '48px', 
                  lineHeight: '48px',
                  margin: '4px 8px',
                  borderRadius: '8px'
                }
              }))}
            />
          </Sider>
        )}

        {/* 移动端抽屉菜单 */}
        <Drawer
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Avatar 
                size={40} 
                icon={<UserOutlined />} 
                style={{ 
                  background: userRole === 'admin' ? '#52c41a' : userRole === 'sub_admin' ? '#fa8c16' : '#1890ff' 
                }} 
              />
              <div>
                <div className="mobile-drawer-title" style={{ 
                  fontSize: '16px', 
                  fontWeight: '600',
                  lineHeight: '1.2',
                  textAlign: 'center'
                }}>
                  <span dangerouslySetInnerHTML={{ __html: t('platform.fullTitle') }} />
                </div>
                <div className="mobile-user-role" style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {userRole === 'admin' ? t('admin.admin') : userRole === 'sub_admin' ? t('admin.teacher') : t('admin.student')}
                </div>
              </div>
            </div>
          }
          placement="left"
          onClose={() => setSidebarCollapsed(true)}
          open={isMobile && sidebarCollapsed === false}
          styles={{ body: { padding: 0 } }}
          width={280}
          style={{ zIndex: 1100 }} /* 确保抽屉在Header之上 */
        >
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            style={{ 
              borderRight: 0,
              background: 'transparent',
              fontSize: '16px'
            }}
            items={getMenuItems().map(item => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              onClick: () => {
                item.onClick();
                setSidebarCollapsed(true); // 点击后关闭抽屉
              },
              style: { 
                height: '56px', 
                lineHeight: '56px',
                margin: '4px 12px',
                borderRadius: '8px'
              }
            }))}
          />
        </Drawer>

        <Layout 
          className={(sidebarCollapsed ?? false) ? 'sidebar-collapsed' : ''}
          style={{ 
            background: '#f5f5f5', 
            display: 'flex',
            flexDirection: 'column',
            marginLeft: !isMobile ? ((sidebarCollapsed ?? false) ? '0' : '240px') : '0', /* 为固定侧边栏留出空间 */
            minHeight: 'calc(100vh - 72px)', /* 减去Header高度，让Layout占满剩余空间 */
            overflow: 'hidden', /* 隐藏超出部分，防止整个layout滚动 */
            transition: 'margin-left 0.2s ease'
          }}>
          <Content 
            className="page-container" 
            style={{ 
              padding: isMobile ? '16px 12px' : '32px 24px',
              width: '100%',
              maxWidth: isMobile ? '100%' : '1600px', /* 大屏幕下更宽 */
              margin: '0 auto', // Center content
              flex: '1 1 auto', /* 允许收缩和增长 */
              overflowY: 'auto', /* 仅Y轴滚动 */
              overflowX: 'hidden' /* 禁止X轴滚动 */
            }}
          >
            <Routes>
              {/* 数据库页面 - 管理员和二级管理员可以访问 */}
              <Route 
                path="/database" 
                element={
                  userRole === 'admin' || userRole === 'sub_admin' ? (
                    <ProtectedRoute>
                      <DatabasePage />
                    </ProtectedRoute>
                  ) : userRole === 'user' ? (
                    <ProtectedRoute>
                      <DatabaseUserPage />
                    </ProtectedRoute>
                  ) : (
                    <Navigate to="/learning" replace />
                  )
                } 
              />
              
              {/* 用户管理页面 - 管理员和二级管理员可以访问 */}
              <Route 
                path="/users" 
                element={
                  (userRole === 'admin' || userRole === 'sub_admin') ? (
                    <ProtectedRoute>
                      <UserManagePage />
                    </ProtectedRoute>
                  ) : (
                    <Navigate to="/learning" replace />
                  )
                } 
              />
              
              {/* 学习页面 - 所有登录用户可以访问 */}
              <Route 
                path="/learning" 
                element={
                  <ProtectedRoute>
                    <LearningPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* 我的学习记录页面 - 所有登录用户可以访问 */}
              <Route 
                path="/my-records" 
                element={
                  <ProtectedRoute>
                    <MyLearningRecordsPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* 用户设置页面 - 所有登录用户可以访问 */}
              <Route 
                path="/settings" 
                element={
                  <ProtectedRoute>
                    <UserSettingsPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* 测验菜单页面 - 所有登录用户可以访问 */}
              <Route 
                path="/quiz-menu" 
                element={
                  <ProtectedRoute>
                    <QuizMenuPage />
                  </ProtectedRoute>
                } 
              />
                {/* 测验页面 - 所有登录用户可以访问 */}
              <Route 
                path="/quiz" 
                element={
                  <ProtectedRoute>
                    <QuizPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* AI问答页面 - 所有登录用户可以访问 */}
              <Route 
                path="/qa" 
                element={
                  <ProtectedRoute>
                    <QAPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Admin 专属管理页面，仅 admin 可访问 */}
              <Route 
                path="/admin/learning-progress" 
                element={
                  userRole === 'admin' ? (
                    <ProtectedRoute>
                      <AdminLearningProgressPage />
                    </ProtectedRoute>
                  ) : (
                    <Navigate to="/learning" replace />
                  )
                }
              />
              <Route 
                path="/admin/file-visibility" 
                element={
                  userRole === 'admin' ? (
                    <ProtectedRoute>
                      <AdminFileVisibilityPage />
                    </ProtectedRoute>
                  ) : (
                    <Navigate to="/learning" replace />
                  )
                }
              />
              <Route 
                path="/admin/tag-file-order" 
                element={
                  userRole === 'admin' ? (
                    <ProtectedRoute>
                      <AdminTagFileOrderPage />
                    </ProtectedRoute>
                  ) : (
                    <Navigate to="/learning" replace />
                  )
                }
              />
              
              {/* 捕获所有未定义的路由，重定向到欢迎页 */}
              <Route path="*" element={<Navigate to="/welcome" replace />} />
            </Routes>
          </Content>
          {/* Footer固定在Layout底部 */}
          {userLoggedIn && !isPublicPage && (
            <div style={{ 
              flexShrink: 0,
              // marginTop: 'auto' /*不再需要，因为父级是固定高度*/
            }}>
              <AppFooter />
            </div>
          )}
        </Layout>
      </Layout>
    </Layout>
    </GenerationLock>
  );
};

const AppWithProviders: React.FC = () => {
  const { userLoggedIn } = useAuth();
  
  return (
    <AIModelProvider userLoggedIn={userLoggedIn}>
      <GenerationProvider>
        <AppContent />
      </GenerationProvider>
    </AIModelProvider>
  );
};

const App: React.FC = () => {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AuthProvider>
        <AppWithProviders />
      </AuthProvider>
    </Router>
  );
};

export default App;
