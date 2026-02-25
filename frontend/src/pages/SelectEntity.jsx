import React, { useEffect, useState } from "react";
import { Button, Typography, Dropdown, Spin, message } from "antd";
import { LogoutOutlined, DownOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useEntity } from "../context/EntityContext";
import { authService } from "../services/auth";
import { masterDataService } from "../services/api";
import { DropdownSkeleton } from "../components/SkeletonLoader";
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


  const getFieldLoose = (obj, searchFields) => {
    if (!obj) return null;
    const keys = Object.keys(obj);
    for (const field of searchFields) {
      if (obj[field] !== undefined && obj[field] !== null) return obj[field];
      const foundKey = keys.find(k =>
        k.toLowerCase().replace(/[^a-z0-9]/g, '') === field.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) return obj[foundKey];
    }
    return null;
  };

  const handleSelect = (entity) => {
    const name = getFieldLoose(entity, ["ENTITY_NAME", "entity_name", "Name", "EntityName", "Entity Name"]) || "Unknown Entity";
    const no = getFieldLoose(entity, ["ENTITY_NO", "entity_no", "ID", "No", "Entity No", "ENTITYID"]) || "0";

    localStorage.setItem("selected_entity", name);
    localStorage.setItem("selected_entity_no", String(no));

    setEntity(name);
    setSelectedLabel(name);

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
  const entityMenuItems = entities.length > 0
    ? entities.map((entity, index) => {
      const name = getFieldLoose(entity, ["ENTITY_NAME", "entity_name", "Name", "EntityName", "Entity Name"]) || "Unknown Entity";
      const no = getFieldLoose(entity, ["ENTITY_NO", "entity_no", "ID", "No", "Entity No", "ENTITYID"]) || index;
      return {
        key: no,
        label: name,
        onClick: () => handleSelect(entity),
      };
    })
    : [{ key: "no-data", label: "No entities found. Please upload Entity Master first.", disabled: true }];

  const entityMenu = { items: entityMenuItems };


  return (
    <div className="entity-container">
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
          <DropdownSkeleton />
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
    </div >
  );
};

export default SelectEntity;
