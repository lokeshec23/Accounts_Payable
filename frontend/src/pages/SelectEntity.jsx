import React from "react";
import { Card, Button, Typography, Dropdown } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useEntity } from "../context/EntityContext";
import { authService } from "../services/auth";
import "../styles/SelectEntity.css";

const { Text } = Typography;

const SelectEntity = () => {
  const navigate = useNavigate();
  const { setEntity } = useEntity();

  // Get username
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const username = storedUser.username || storedUser.email || "User";
  const userInitial = username.charAt(0).toUpperCase();

  const handleLogout = () => {
    authService.logout();
    navigate("/");
  };

  const userMenuItems = [
    {
      key: "logout",
      label: "Logout",
      icon: <LogoutOutlined />,
      danger: true,
      onClick: handleLogout,
    },
  ];

  const handleSelect = (entity) => {
    localStorage.setItem("selected_entity", entity);
    setEntity(entity);
    navigate("/dashboard");
  };

  return (
    <div className="entity-container">

      {/* HEADER */}
      <header className="entity-header">
        <img src="/loandna-logo.png" alt="LoanDNA Logo" className="header-logo" />

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div className="header-user">
            <div className="user-avatar">{userInitial}</div>
          </div>
        </Dropdown>
      </header>

      {/* CURVE BACKGROUND */}
      <div className="entity-bottom-curve"></div>

      {/* CARD */}
      <div className="entity-card">

        <h2 className="entity-title">Select Entity</h2>

        <Text type="secondary" className="entity-subtitle">
          Choose which entity you want to work with.
        </Text>

        <div className="entity-buttons">
          <Button
            type="primary"
            className="entity-btn"
            block
            onClick={() => handleSelect("Consolidated Analytics Inc")}
          >
            Consolidated Analytics Inc
          </Button>

          <Button
            className="entity-btn secondary-btn"
            block
            onClick={() =>
              handleSelect("Consolidated Analytics Private Limited")
            }
          >
            Consolidated Analytics Private Limited
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SelectEntity;
