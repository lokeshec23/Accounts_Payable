import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Steps } from 'antd';
import { Link, useNavigate } from "react-router-dom";
import {
    UserOutlined,
    LockOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    ArrowRightOutlined,
    CheckCircleOutlined,
    SafetyCertificateOutlined
} from '@ant-design/icons';
import { authService } from '../services/auth';
import '../styles/Loginpage.css';
import { useTheme } from '../context/ThemeContext';
const { Text, Title } = Typography;

const ForgotPasswordPage = () => {
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: Password
    const [email, setEmail] = useState('');
    const [form] = Form.useForm();
    const navigate = useNavigate();

    const handleSendOtp = async (values) => {
        setLoading(true);
        try {
            await authService.sendOtp(values.email, "forgot_password");
            message.success('OTP sent to your registered email.');
            setEmail(values.email);
            setStep(2);
        } catch (error) {
            message.error(error.detail || 'Failed to send OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (values) => {
        setLoading(true);
        try {
            await authService.verifyOtp(email, values.otp, "forgot_password");
            message.success('OTP verified. You can now reset your password.');
            setStep(3);
        } catch (error) {
            message.error(error.detail || 'Invalid or expired OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (values) => {
        setLoading(true);
        try {
            await authService.resetPassword(email, values.new_password);
            message.success('Password updated successfully! Please login.');
            navigate('/');
        } catch (error) {
            message.error(error.detail || 'Failed to update password.');
        } finally {
            setLoading(false);
        }
    };

    const onFinish = (values) => {
        if (step === 1) {
            handleSendOtp(values);
        } else if (step === 2) {
            handleVerifyOtp(values);
        } else {
            handleResetPassword(values);
        }
    };

    return (
        <div className="login-container">
            <div className="bottom-curve"></div>

            <div className="login-card">
                <div className="logo-container">
                    <img
                        src={isDarkMode ? "/image.png" : "/loandna-logo.png"}
                        alt="loanDNA Logo"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<h2 style="color: #3ba5d8; margin: 0;">loanDNA</h2>';
                        }}
                    />
                </div>

                <h2 className="login-title" style={{ marginBottom: 8 }}>Reset Password</h2>

                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <Text type="secondary" style={{ fontSize: '14px' }}>
                        {step === 1 ? "Enter your email to receive a verification code" :
                            step === 2 ? "Verify the 6-digit code sent to your email" :
                                "Create a strong new password for your account"}
                    </Text>
                </div>

                <Steps
                    current={step - 1}
                    size="small"
                    labelPlacement="vertical"
                    style={{ marginBottom: 32, padding: '0 10px' }}
                    items={[
                        { title: 'Email', icon: step > 1 ? <CheckCircleOutlined /> : <UserOutlined /> },
                        { title: 'Verify', icon: step > 2 ? <CheckCircleOutlined /> : <SafetyCertificateOutlined /> },
                        { title: 'Reset', icon: <LockOutlined /> },
                    ]}
                />

                <Form
                    form={form}
                    name="forgot-password"
                    onFinish={onFinish}
                    autoComplete="off"
                    layout="vertical"
                    requiredMark={false}
                >

                    {step === 1 && (
                        <Form.Item
                            label="Email Address"
                            name="email"
                            rules={[
                                { required: true, message: 'Enter your email!' },
                                { type: 'email', message: 'Enter a valid email!' }
                            ]}
                        >
                            <Input
                                placeholder="Email"
                                className="login-input"
                                prefix={<UserOutlined className="input-icon" />}
                            />
                        </Form.Item>
                    )}

                    {step === 2 && (
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <Text type="secondary">Verification code sent to </Text>
                                <Text strong>{email}</Text>
                            </div>
                            <Form.Item
                                label="Enter OTP"
                                name="otp"
                                rules={[
                                    { required: true, message: 'Please enter the OTP!' },
                                    { len: 6, message: 'OTP must be 6 digits!' }
                                ]}
                            >
                                <Input
                                    placeholder="6-digit code"
                                    className="login-input"
                                    prefix={<SafetyCertificateOutlined className="input-icon" />}
                                    maxLength={6}
                                />
                            </Form.Item>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Form.Item
                                label="New Password"
                                name="new_password"
                                rules={[{ required: true, message: 'Enter your new password!' }]}
                            >
                                <Input.Password
                                    placeholder="New Password"
                                    className="login-input"
                                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                                    prefix={<LockOutlined className="input-icon" />}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Confirm Password"
                                name="confirm_password"
                                dependencies={['new_password']}
                                rules={[
                                    { required: true, message: 'Confirm your password!' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('new_password') === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('The two passwords that you entered do not match!'));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password
                                    placeholder="Confirm Password"
                                    className="login-input"
                                    iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                                    prefix={<LockOutlined className="input-icon" />}
                                />
                            </Form.Item>
                        </>
                    )}

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            block
                            className="login-button"
                            loading={loading}
                        >
                            {step === 1 ? "Send OTP" : step === 2 ? "Verify OTP" : "Update Password"}
                        </Button>
                        {step === 2 && (
                            <Button
                                type="link"
                                block
                                onClick={() => setStep(1)}
                                style={{ marginTop: 8 }}
                            >
                                Change Email
                            </Button>
                        )}
                    </Form.Item>

                    <div className="login-footer">
                        <Link to="/" className="register-link">Back to Login</Link>
                    </div>

                </Form>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
