import React from 'react';
import { Select } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Option } = Select;

interface LanguageSwitcherProps {
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ size = 'middle', style }) => {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
    { code: 'zh-TW', name: '繁體中文', flag: '🇹🇼' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
  ];
  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
  };

  return (    <Select
      value={i18n.language}
      onChange={handleLanguageChange}
      size={size}
      style={{ minWidth: 120, ...style }}
      suffixIcon={<GlobalOutlined />}
      popupMatchSelectWidth={false}
    >
      {languages.map(lang => (
        <Option key={lang.code} value={lang.code}>
          <span style={{ marginRight: 8 }}>{lang.flag}</span>
          {lang.name}
        </Option>
      ))}
    </Select>
  );
};

export default LanguageSwitcher;
