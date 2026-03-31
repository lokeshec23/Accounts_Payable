import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Card } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { LockOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { authService } from '../services/auth';
import { useTheme } from '../context/ThemeContext';
import '../styles/Loginpage.css'; // Reuse login styles

const { Title, Text } = Typography;

const ForcePasswordChange = () => {
    const [loading, setLoading] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { isDarkMode } = useTheme();
    const email = location.state?.email;

    if (!email) {
        navigate('/login');
        return null;
    }

    const handlePasswordChange = async (values) => {
        setLoading(true);
        try {
            await authService.changePasswordFirstTime(email, values.password);
            message.success('Password updated successfully! Please login with your new password.');
            authService.logout(); // Clear session if any
            navigate('/login');
        } catch (error) {
            message.error(error.detail || 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="bottom-curve"></div>
            
            <Card className="login-card" style={{ maxWidth: 450 }}>
                <div className="logo-container">
                    <img src={isDarkMode ? "/image.png" : "/loandna_logo.png"} alt="Logo" className="logo" />
                </div>
                
                <Title level={3} className="login-title">Change Your Password</Title>
                <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
                    Since this is your first time logging in, you must change your default password for security.
                </Text>

                <Form layout="vertical" onFinish={handlePasswordChange}>
                    <Form.Item
                        label="New Password"
                        name="password"
                        rules={[
                            { required: true, message: 'Please enter a new password' },
                            { min: 6, message: 'Password must be at least 6 characters' }
                        ]}
                    >
                        <Input.Password 
                            prefix={<LockOutlined />} 
                            placeholder="New Password" 
                            className="login-input"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Confirm New Password"
                        name="confirm"
                        dependencies={['password']}
                        rules={[
                            { required: true, message: 'Please confirm your new password' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('password') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Passwords do not match'));
                                },
                            }),
                        ]}
                    >
                        <Input.Password 
                            prefix={<LockOutlined />} 
                            placeholder="Confirm Password" 
                            className="login-input"
                        />
                    </Form.Item>

                    <Form.Item>
                        <Button 
                            type="primary" 
                            htmlType="submit" 
                            className="login-button" 
                            loading={loading}
                            block
                        >
                            Update Password <ArrowRightOutlined />
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default ForcePasswordChange;
