import React from "react";
import { Card, Button, Typography } from "antd";
import { BankOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useEntity } from "../context/EntityContext";

const { Title, Text } = Typography;

const SelectEntity = () => {
  const navigate = useNavigate();
  const { setEntity } = useEntity();

  const handleSelect = (value) => {
    localStorage.setItem("selected_entity", value);
    setEntity(value);
    navigate("/dashboard"); // Go to dashboard after selection
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fa",
      }}
    >
      <Card style={{ width: 400, textAlign: "center", padding: "20px" }}>
        <BankOutlined style={{ fontSize: 40, color: "#1677ff" }} />

        <Title level={3} style={{ marginTop: 15 }}>
          Select an Entity
        </Title>

        <Text>Please choose which entity you want to work with.</Text>

        <div style={{ marginTop: 30 }}>
          <Button
            type="primary"
            block
            style={{ marginBottom: 15, height: 45 }}
            onClick={() => handleSelect("Consolidated Analytics Inc")}
          >
            Consolidated Analytics Inc
          </Button>

          <Button
            type="primary"
            block
            style={{ height: 45 }}
            onClick={() =>
              handleSelect("Consolidated Analytics Private Limited")
            }
          >
            Consolidated Analytics Private Limited
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SelectEntity;
