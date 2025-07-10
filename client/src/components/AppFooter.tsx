import React from 'react';
import { Layout, Row, Col, Typography, Space } from 'antd';
import { FacebookOutlined, YoutubeOutlined, WechatOutlined } from '@ant-design/icons';
import './../styles/AppFooter.css';

const { Footer } = Layout;
const { Text, Link } = Typography;

const AppFooter: React.FC = () => {
  return (
    <Footer className="app-footer">
      <div className="footer-container">
        <Row justify="center" align="middle" gutter={[16, 16]}>
          <Col>
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
          </Col>
        </Row>
        <Row justify="center" className="footer-links">
          <Col>
            <Space split={<span style={{ color: 'rgba(255,255,255,0.45)' }}>|</span>}>
              <Link href="https://www.cem-macau.com/zh/terms-of-service/" target="_blank" className="footer-link">
                澳電網站使用條款
              </Link>
              <Link href="https://www.cem-macau.com/zh/privacy-statement/" target="_blank" className="footer-link">
                收集個人資料聲明
              </Link>
              <Link href="https://www.cem-macau.com/zh/customer-service/stayalertforphishing/" target="_blank" className="footer-link">
                慎防詐騙訊息
              </Link>
            </Space>
          </Col>
        </Row>
        <Row justify="center" className="footer-copyright">
          <Col>
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
