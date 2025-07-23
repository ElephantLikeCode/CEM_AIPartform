import React from 'react';
import { Layout, Row, Col, Typography, Space } from 'antd';
import { FacebookOutlined, YoutubeOutlined, WechatOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import './../styles/AppFooter.css';

const { Footer } = Layout;
const { Text, Link } = Typography;

const AppFooter: React.FC = () => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = React.useState(false);
  
  // 检测移动端
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <Footer className="app-footer">
      <div className="footer-container">
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={8} xl={6}>
            <div style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Space size="large">
                <Link href="https://www.facebook.com/CEMMacao/" target="_blank" className="social-icon">
                  <FacebookOutlined />
                </Link>
                <Link href="https://www.youtube.com/user/MYCEM2010" target="_blank" className="social-icon">
                  <YoutubeOutlined />
                </Link>
                <Link href="https://www.cem-macau.com/zh/about-cem/wechat" target="_blank" className="social-icon">
                  <WechatOutlined />
                </Link>
              </Space>
            </div>
          </Col>
          <Col xs={24} sm={24} md={12} lg={16} xl={18}>
            <div style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end' }}>
              <Space 
                split={<span style={{ color: 'rgba(0,0,0,0.45)' }}>|</span>}
                size="small"
                wrap
              >
                <Link href="https://www.cem-macau.com/zh/terms-of-service/" target="_blank" className="footer-link">
                  {t('auth.termsAndConditions')}
                </Link>
                <Link href="https://www.cem-macau.com/zh/privacy-statement/" target="_blank" className="footer-link">
                  {t('auth.privacyPolicy')}
                </Link>
                <Link href="https://www.cem-macau.com/zh/customer-service/stayalertforphishing/" target="_blank" className="footer-link">
                  慎防詐騙訊息
                </Link>
              </Space>
            </div>
          </Col>
        </Row>
        <Row justify="center" className="footer-copyright">
          <Col xs={24} style={{ textAlign: 'center' }}>
            <Text className="copyright-text">
              © {new Date().getFullYear()} 版權所有，澳門電力股份有限公司保留一切權利。| create by Trainee 6594 Harry
            </Text>
          </Col>
        </Row>
      </div>
    </Footer>
  );
};

export default AppFooter;
