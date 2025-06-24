import React, { useState } from 'react';
import { Button, Typography, Space, Card, Row, Col } from 'antd';
import {
  BookOutlined, TrophyOutlined, DatabaseOutlined,
  RightOutlined, StarOutlined, ThunderboltOutlined, HeartOutlined, RobotOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

const { Title, Paragraph, Text } = Typography;

const WelcomePage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();

  // 检测移动端
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const features = [
    {
      icon: <DatabaseOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      title: t('welcome.features.smartAnalysis.title'),
      description: t('welcome.features.smartAnalysis.description')
    },
    {
      icon: <BookOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      title: t('welcome.features.personalizedLearning.title'),
      description: t('welcome.features.personalizedLearning.description')
    },
    {
      icon: <RobotOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
      title: t('welcome.features.aiAssistant.title'),
      description: t('welcome.features.aiAssistant.description')
    },
    {
      icon: <TrophyOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
      title: t('welcome.features.smartEvaluation.title'),
      description: t('welcome.features.smartEvaluation.description')
    }
  ];

  const handleEnterPlatform = () => {
    setLoading(true);
    setTimeout(() => {
      navigate('/database');
    }, 1000);
  };
  return (
    <div className="welcome-page-container" style={{
      minHeight: '100vh',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '16px' : '20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 背景装饰 - 仅在桌面端显示 */}
      {!isMobile && (
        <div className="welcome-floating-decoration" style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '30%',
          height: '140%',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '50%',
          transform: 'rotate(-15deg)'
        }} />
      )}      {/* 主要内容 */}
      <div style={{
        maxWidth: isMobile ? '100%' : 1000,
        width: '100%',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>        {/* 标题区域 */}
        <div className="welcome-hero-section" style={{ marginBottom: isMobile ? 24 : 36 }}>
          {/* 语言切换器 */}
          <div style={{ 
            position: 'absolute', 
            top: isMobile ? '10px' : '20px', 
            right: isMobile ? '10px' : '20px',
            zIndex: 1000
          }}>
            <LanguageSwitcher />
          </div>
          
          <img
            src="https://www.cem-macau.com/_nuxt/img/logo.5ab12fa.svg"
            alt="STGC3000 Logo"
            style={{ 
              height: isMobile ? 90 : 120,
              marginBottom: isMobile ? 16 : 16,
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))'
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallbackIcon = document.createElement('div');
              fallbackIcon.innerHTML = `<div style="font-size: ${isMobile ? '60px' : '80px'}; color: #fff; margin-bottom: ${isMobile ? '16px' : '16px'};">🤖</div>`;
              e.currentTarget.parentNode?.insertBefore(fallbackIcon, e.currentTarget);
            }}
          />
            <Title className="welcome-title" level={1} style={{ 
            color: '#fff', 
            fontSize: isMobile ? 24 : 38,
            fontWeight: 700,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            {t('common.title')}
          </Title>
            <Paragraph className="welcome-subtitle" style={{ 
            color: 'rgba(255,255,255,0.9)', 
            fontSize: isMobile ? 14 : 15,
            margin: '12px auto 0 auto',
            maxWidth: 500
          }}>
            {t('welcome.workflow')}
          </Paragraph>
        </div>        {/* 功能特性 */}
        <Card
          className="welcome-features-card"
          style={{
            marginBottom: isMobile ? 16 : 28,
            borderRadius: isMobile ? 12 : 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            border: 'none'
          }}
          styles={{ body: { padding: isMobile ? '16px' : '28px' } }}
        >
          <Row className="welcome-features-grid" gutter={[isMobile ? 16 : 24, isMobile ? 16 : 24]}>
            {features.map((feature, index) => (
              <Col xs={12} sm={isMobile ? 12 : 6} key={index}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: isMobile ? 8 : 12 }}>
                    {React.cloneElement(feature.icon, { 
                      style: { fontSize: isMobile ? 24 : 36, color: feature.icon.props.style.color }
                    })}
                  </div>
                  <Title level={5} style={{ 
                    margin: '0 0 8px 0', 
                    color: '#333', 
                    fontSize: isMobile ? 14 : 16 
                  }}>
                    {feature.title}
                  </Title>
                  <Text style={{ fontSize: isMobile ? 12 : 14, color: '#666' }}>
                    {feature.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        {/* 亮点展示 - 仅在桌面端显示 */}
        {!isMobile && (
          <div className="welcome-stats-section" style={{ marginBottom: 24 }}>
            <Row gutter={24}>
              <Col span={8}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                <StarOutlined style={{ fontSize: 20, marginBottom: 6 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t('welcome.highlights.aiDriven')}</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <ThunderboltOutlined style={{ fontSize: 20, marginBottom: 6 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t('welcome.highlights.efficientLearning')}</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <HeartOutlined style={{ fontSize: 20, marginBottom: 6 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t('welcome.highlights.personalized')}</div>
              </div>
            </Col>          </Row>
        </div>
        )}

        {/* 进入按钮 */}
        <Space direction="vertical" align="center">
          <Button
            type="primary"
            size={isMobile ? "middle" : "large"}
            icon={<RightOutlined />}
            onClick={handleEnterPlatform}
            loading={loading}            style={{
              height: isMobile ? 40 : 44,
              paddingLeft: isMobile ? 16 : 20,
              paddingRight: isMobile ? 16 : 20,
              fontSize: isMobile ? 14 : 15,
              fontWeight: 600,
              borderRadius: isMobile ? 20 : 22,
              background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)'
            }}
          >
            {loading ? t('welcome.cta.entering') : (isMobile ? t('welcome.cta.enterPlatformMobile') : t('welcome.cta.enterPlatform'))}
          </Button>
          
          {!loading && (            <Text style={{ 
              color: 'rgba(255,255,255,0.8)', 
              fontSize: isMobile ? 12 : 13,
              marginTop: 8
            }}>
              {isMobile ? t('welcome.cta.startJourneyMobile') : t('welcome.cta.startJourney')}
            </Text>
          )}
        </Space>
      </div>
    </div>
  );
};

export default WelcomePage;
