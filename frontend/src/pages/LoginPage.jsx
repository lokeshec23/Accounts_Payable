import React, { useState } from 'react';
import { Form, Input, Button, Typography, message } from 'antd';
import { Link, useNavigate } from "react-router-dom";
import {
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ArrowRightOutlined,
  MailOutlined
} from '@ant-design/icons';
import { authService } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import '../styles/Loginpage.css';

const { Text } = Typography;

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const response = await authService.login(values);
      console.log('Login response:', response); // Add this for debugging

      message.success('Login successful!');
      navigate('/select-entity');
    } catch (error) {
      message.error(error.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="bottom-curve"></div>

      <div className="login-card">
        <div className="logo-container">
          <img src={isDarkMode ? "/image.png" : "/loandna_logo.png"} alt="LoanDNA Logo" className="logo" />
        </div>

        <h2 className="login-title">Log in</h2>

        <Form name="login" onFinish={handleLogin} autoComplete="off" layout="vertical">

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Enter your email!' },
              { type: 'email', message: 'Enter a valid email!' }
            ]}
          >
            <Input
              placeholder="Email"
              className="login-input"
              type="email"
              prefix={<MailOutlined className="input-icon" />}
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Enter your password!' }]}
          >
            <Input.Password
              placeholder="••••••••••••"
              className="login-input"
              iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
              prefix={<LockOutlined className="input-icon" />}
            />
          </Form.Item>

          <div className="forgot-password">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-button"
              loading={loading}
            >
              Login <ArrowRightOutlined />
            </Button>
          </Form.Item>

          <div className="login-footer">
            <Text type="primary">Don't have an account? </Text>
            <Link to="/register" className="register-link">Register</Link>
          </div>

        </Form>
      </div>
    </div>
  );
};

export default LoginPage;