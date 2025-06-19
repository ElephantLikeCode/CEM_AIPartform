// 页面路径常量
export const PAGES = {
  HOME: '/',
  WELCOME: '/welcome',
  DATABASE: '/database',
  LEARNING: '/learning',
  QA: '/qa',
  QUIZ: '/quiz',
  QUIZ_MENU: '/quiz-menu',
  LOGIN: '/login',
  PROFILE: '/profile'
} as const;

// 导航函数
export const navigateToPage = (path: string) => {
  window.location.href = path;
};

// 带参数的导航函数
export const navigateWithParams = (basePath: string, params: Record<string, string>) => {
  const searchParams = new URLSearchParams(params);
  const fullPath = `${basePath}?${searchParams.toString()}`;
  navigateToPage(fullPath);
};

// React Router 导航函数（如果使用 React Router）
export const useNavigateToPage = () => {
  // 如果项目使用 React Router，可以在这里导入 useNavigate
  // import { useNavigate } from 'react-router-dom';
  // const navigate = useNavigate();
  // return navigate;
  
  // 目前使用简单的页面跳转
  return navigateToPage;
};
