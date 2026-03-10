import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, Typography, message, Steps } from "antd";
import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  UserOutlined,
  MailOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { authService } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import "../styles/RegisterPage.css";

const { Text, Title } = Typography;

export default function RegisterPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0: Email, 1: OTP, 2: Details
  const [email, setEmail] = useState("");
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    try {
      const values = await form.validateFields(['email']);
      setLoading(true);
      await authService.sendOtp(values.email, "registration");
      setEmail(values.email);
      message.success('OTP sent to your email.');
      setCurrentStep(1);
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.detail || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      const values = await form.validateFields(['otp']);
      setLoading(true);
      await authService.verifyOtp(email, values.otp, "registration");
      message.success('Email verified successfully.');
      setCurrentStep(2);
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.detail || 'Invalid OTP.');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await authService.register({
        username: values.username,
        email: email,
        password: values.password
      });
      message.success('Registration successful! Pending Admin Approval.');
      form.resetFields();
      navigate('/');
    } catch (error) {
      message.error(error.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validatePasswordsMatch = ({ getFieldValue }) => ({
    validator(_, value) {
      if (!value || getFieldValue("password") === value) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("Passwords do not match"));
    },
  });

  return (
    <div className="register-container">
      <div className="bottom-curve"></div>

      <div className="register-card">
        <div className="register-logo">
          <img
            src={isDarkMode ? "/image.png" : "/loandna-logo.png"}
            alt="loanDNA Logo"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = '<h2 style="color: #3ba5d8; margin: 0;">loanDNA</h2>';
            }}
          />
        </div>

        <h1 className="register-title">Create Account</h1>

        <Steps
          current={currentStep}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Email' },
            { title: 'Verify' },
            { title: 'Details' },
          ]}
        />

        <Form
          className="register-form"
          layout="vertical"
          form={form}
          name="register"
          onFinish={onFinish}
          initialValues={{}}
        >
          {currentStep === 0 && (
            <>
              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: "Please input your email" },
                  { type: "email", message: "Please enter a valid email" },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="you@domain.com" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  block
                  onClick={handleSendOtp}
                  loading={loading}
                >
                  Send OTP →
                </Button>
              </Form.Item>
            </>
          )}

          {currentStep === 1 && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Text type="secondary">Verification code sent to </Text>
                <Text strong>{email}</Text>
              </div>
              <Form.Item
                name="otp"
                label="Enter OTP"
                rules={[
                  { required: true, message: "Please enter the OTP" },
                  { len: 6, message: "OTP must be 6 digits" }
                ]}
              >
                <Input prefix={<SafetyCertificateOutlined />} placeholder="6-digit code" maxLength={6} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  block
                  onClick={handleVerifyOtp}
                  loading={loading}
                >
                  Verify OTP →
                </Button>
                <Button
                  type="link"
                  block
                  onClick={() => setCurrentStep(0)}
                  style={{ marginTop: 8 }}
                >
                  Change Email
                </Button>
              </Form.Item>
            </>
          )}

          {currentStep === 2 && (
            <>
              <Form.Item
                name="username"
                label="Username"
                rules={[{ required: true, message: "Please input a username" }]}
              >
                <Input prefix={<UserOutlined />} placeholder="Username" />
              </Form.Item>

              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true, message: "Enter your password" },
                  { min: 6, message: "Password must be at least 6 characters" },
                ]}
                hasFeedback
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Enter password"
                  iconRender={(visible) =>
                    visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                  }
                />
              </Form.Item>

              <Form.Item
                name="confirm"
                label="Confirm Password"
                dependencies={["password"]}
                hasFeedback
                rules={[
                  { required: true, message: "Confirm your password" },
                  validatePasswordsMatch,
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Confirm password"
                  iconRender={(visible) =>
                    visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                  }
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  className="register-submit-btn"
                  loading={loading}
                >
                  Complete Registration →
                </Button>
              </Form.Item>
            </>
          )}

          <div className="register-footer" style={{ marginTop: 16 }}>
            <Text type="secondary">Already have an account? </Text>
            <Link to="/" className="register-link">Login</Link>
          </div>
        </Form>
      </div>
    </div>
  );
}
