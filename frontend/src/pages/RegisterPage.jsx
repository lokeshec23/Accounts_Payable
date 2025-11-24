import React from "react";
import { Link } from "react-router-dom";
import { Form, Input, Button, Typography, message } from "antd";
import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  UserOutlined,
  MailOutlined,
  LockOutlined,
} from "@ant-design/icons";
import "../styles/RegisterPage.css";

const { Text } = Typography;

export default function RegisterPage() {
  const [form] = Form.useForm();

  const onFinish = (values) => {
    // In a real app you'd call your API here.
    // For demo we just show a message and reset the password fields.
    message.success("Registration successful (demo). Check console for values.");
    console.log("REGISTER VALUES", values);
    form.resetFields(["password", "confirm"]);
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
            src="/loandna-logo.png"
            alt="loanDNA Logo"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = '<h2 style="color: #3ba5d8; margin: 0;">loanDNA</h2>';
            }}
          />
        </div>

        <h1 className="register-title">Create Account</h1>

        <Form
          className="register-form"
          layout="vertical"
          form={form}
          name="register"
          onFinish={onFinish}
          initialValues={{}}
        >


          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true, message: "Please input a username" }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>


          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Please input your email" },
              { type: "email", message: "Please enter a valid email" },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@domain.com" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: "Please input your password" },
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
              { required: true, message: "Please confirm your password" },
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
            >
              Register →
            </Button>
          </Form.Item>

          <div className="register-footer">
            <Text type="secondary">Already have an account? </Text>
            <Link to="/" className="register-link">Login</Link>
          </div>
        </Form>
      </div>
    </div>
  );
}
