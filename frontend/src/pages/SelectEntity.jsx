import React, { useEffect, useState } from "react";
import { Button, Typography, Dropdown, Spin, message } from "antd";
import { LogoutOutlined, DownOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useEntity } from "../context/EntityContext";
import { authService } from "../services/auth";
import { masterDataService } from "../services/api";
import "../styles/SelectEntity.css";

const { Text } = Typography;

const SelectEntity = () => {
  const navigate = useNavigate();
  const { setEntity } = useEntity();

  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("Select Entity");

  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const username = storedUser.username || storedUser.email || "User";
  const userInitial = username.charAt(0).toUpperCase();

  useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    try {
      setLoading(true);
      const data = await masterDataService.getEntities();
      setEntities(data);
    } catch (err) {
      message.error("Failed to load entities");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    authService.logout();
    navigate("/");
  };

  const handleSelect = (entity) => {
    localStorage.setItem("selected_entity", entity.ENTITY_NAME);
    localStorage.setItem("selected_entity_no", entity.ENTITY_NO);

    setEntity(entity.ENTITY_NAME);
    setSelectedLabel(entity.ENTITY_NAME);

    navigate("/dashboard");
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

  // 🔽 Entity dropdown menu
  const entityMenu = {
    items: entities.map((entity) => ({
      key: entity.ENTITY_NO,
      label: entity.ENTITY_NAME,
      onClick: () => handleSelect(entity),
    })),
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

      <div className="entity-bottom-curve"></div>

      {/* CARD */}
      <div className="entity-card">
        <h2 className="entity-title">Select Entity</h2>

        <Text type="secondary" className="entity-subtitle">
          Choose which entity you want to work with.
        </Text>

        {loading ? (
          <Spin style={{ marginTop: 30 }} />
        ) : (
          <Dropdown menu={entityMenu} trigger={["click"]}>
            <Button
              type="primary"
              className="entity-dropdown-btn"
              size="large"
            >
              {selectedLabel} <DownOutlined />
            </Button>
          </Dropdown>
        )}
      </div>
    </div>
  );
};

export default SelectEntity;
