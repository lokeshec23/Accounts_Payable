import React from 'react';
import { Form, Input, Button } from 'antd';
import {
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ArrowRightOutlined,
  MailOutlined
} from '@ant-design/icons';
import '../styles/Loginpage.css';

const LoginPage = () => {
  const handleLogin = (values) => {
    console.log('Login values:', values);
  };

  return (
    <div className="login-container">
      <div className="bottom-curve"></div>

      <div className="login-card">
        <div className="logo-container">
          <img src="/loandna_logo.png" alt="LoanDNA Logo" className="logo" />
        </div>

        <h2 className="login-title">Log in</h2>

        <Form name="login" onFinish={handleLogin} autoComplete="off" layout="vertical">

          {/* Email field with Mail icon */}
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

          {/* Password */}
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
            <a href="/forgot-password">Forgot password?</a>
          </div>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-button"
            >
              Login <ArrowRightOutlined />
            </Button>
          </Form.Item>

          <div className="login-footer">
            <span>Don't have an account? </span>
            <a href="/register" className="register-link">Register</a>
          </div>

        </Form>
      </div>
    </div>
  );
};

export default LoginPage;
