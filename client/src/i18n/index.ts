import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';
import pt from './locales/pt.json';

const resources = {
  'zh-CN': {
    translation: zhCN,
  },
  'zh-TW': {
    translation: zhTW,
  },
  en: {
    translation: en,
  },
  pt: {
    translation: pt,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    debug: true, // 启用调试模式，查看语言检测过程

    interpolation: {
      escapeValue: false,
    },detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      // 添加语言映射，将浏览器检测到的语言代码映射到我们支持的语言
      lookupLocalStorage: 'language',
      lookupFromPathIndex: 0,
      lookupFromSubdomainIndex: 0,
      // 语言代码转换
      convertDetectedLanguage: (lng: string) => {
        // 将各种中文变体统一映射
        if (lng.startsWith('zh')) {
          if (lng.includes('TW') || lng.includes('HK') || lng.includes('MO')) {
            return 'zh-TW'; // 繁体中文（台湾、香港、澳门）
          }
          return 'zh-CN'; // 简体中文（大陆）
        }
        // 将各种英文变体统一映射
        if (lng.startsWith('en')) {
          return 'en';
        }
        // 将各种葡萄牙语变体统一映射
        if (lng.startsWith('pt')) {
          return 'pt';
        }
        return lng;
      }
    },  });

// 添加语言检测调试信息
i18n.on('initialized', () => {
  console.log('🌍 i18n 初始化完成');
  console.log('🔍 检测到的语言:', i18n.language);
  console.log('🌐 浏览器语言:', navigator.language);
  console.log('🌐 浏览器语言列表:', navigator.languages);
  console.log('💾 localStorage 中的语言:', localStorage.getItem('language'));
});

i18n.on('languageChanged', (lng) => {
  console.log('🔄 语言已切换到:', lng);
});

export default i18n;
