import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Steps } from 'antd';
import { Link, useNavigate } from "react-router-dom";
import {
    UserOutlined,
    LockOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    ArrowRightOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import { authService } from '../services/auth';
import '../styles/Loginpage.css';

const { Text, Title } = Typography;

const ForgotPasswordPage = () => {
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [form] = Form.useForm();
    const navigate = useNavigate();

    const handleCheckEmail = async (values) => {
        setLoading(true);
        try {
            const response = await authService.checkEmail(values.email);
            if (response.exists) {
                message.success('Email verified. Please set a new password.');
                setEmail(values.email);
                setStep(2);
            } else {
                message.error('Email does not exist. Please register first.');
            }
        } catch (error) {
            console.error("Check email error:", error);
            message.error(error.detail || error.message || 'Failed to verify email.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (values) => {
        if (values.new_password !== values.confirm_password) {
            message.error('Passwords do not match!');
            return;
        }

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
            handleCheckEmail(values);
        } else {
            handleResetPassword(values);
        }
    };

    return (
        <div className="login-container">
            <div className="bottom-curve"></div>

            <div className="login-card">
                <div className="logo-container">
                    <img src="/loandna_logo.png" alt="LoanDNA Logo" className="logo" />
                </div>

                <h2 className="login-title">Reset Password</h2>
                <p style={{ textAlign: 'center', marginBottom: 24, color: '#666' }}>
                    {step === 1 ? "Enter your email to verify your account" : "Set a new password for your account"}
                </p>

                <Form
                    form={form}
                    name="forgot-password"
                    onFinish={onFinish}
                    autoComplete="off"
                    layout="vertical"
                >

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
                            prefix={<UserOutlined className="input-icon" />}
                            disabled={step === 2}
                        />
                    </Form.Item>

                    {step === 2 && (
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
                            className="login-button"
                            loading={loading}
                            icon={step === 1 ? <CheckCircleOutlined /> : <ArrowRightOutlined />}
                        >
                            {step === 1 ? "Check Email" : "Update Password"}
                        </Button>
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
