import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Dropdown } from "antd";
import { LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { authService } from "../services/auth";
import "../styles/Header.css";
import { useEntity } from "../context/EntityContext";

const Header = () => {
  const [username, setUsername] = useState("User");
  const { entity } = useEntity();
  const [role, setRole] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUsername(user.username || user.email || "User");
        setRole(user.role || "");
      } catch {
        setUsername("User");
      }
    }
  }, []);

  const isActive = (path) => {
    if (path === "/dashboard") return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    authService.logout();
    navigate("/");
  };

  const userInitial = username.charAt(0).toUpperCase();

  return (
    <header className="app-header">
      <div className="header-container">
        {/* Logo */}
        <div className="header-logo">
          <img src="/loandna-logo.png" alt="loanDNA" />
        </div>

        {/* NAVIGATION */}
        <nav className="header-nav">
          <Link
            to="/dashboard"
            className={`nav-tab ${isActive("/dashboard") ? "active" : ""}`}
          >
            Dashboard
          </Link>

          {(role === "coder" || role === "admin") && (
            <Link
              to="/invoice"
              className={`nav-tab ${isActive("/invoice") ? "active" : ""}`}
            >
              Invoice
            </Link>
          )}

          {(role === "coder" || role === "admin") && (
            <Link
              to="/coding"
              className={`nav-tab ${isActive("/coding") ? "active" : ""}`}
            >
              Coding
            </Link>
          )}

          {(role === "approver" || role === "admin") && (
            <Link
              to="/approvals"
              className={`nav-tab ${isActive("/approvals") ? "active" : ""}`}
            >
              Approvals
            </Link>
          )}

          <Link
            to="/master-data"
            className={`nav-tab ${isActive("/master-data") ? "active" : ""}`}
          >
            Master Data
          </Link>

          <Link
            to="/settings"
            className={`nav-tab ${isActive("/settings") ? "active" : ""}`}
          >
            Settings
          </Link>

          {role === "admin" && (
            <Link
              to="/admin"
              className={`nav-tab ${isActive("/admin") ? "active" : ""}`}
            >
              Admin
            </Link>
          )}
        </nav>

        {/* RIGHT SIDE - USER DROPDOWN */}
        <div className="header-actions">
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            dropdownRender={() => (
              <div className="dropdown-wrapper">
                {/* ARROW POINTER */}
                <div className="dropdown-arrow"></div>

                {/* DROPDOWN CARD */}
                <div className="mini-profile-dropdown">
                  {/* BOX AVATAR */}
                  <div className="mini-profile-avatar-box">{userInitial}</div>

                  {/* ENTITY NAME */}
                  <div className="mini-profile-entity">{entity}</div>

                  {/* MENU */}
                  <div className="mini-profile-menu">
                    {/* CHANGE ENTITY */}
                    <div
                      className="mini-profile-menu-item"
                      onClick={() => navigate("/select-entity")}
                    >
                      <SettingOutlined className="menu-icon blue" />
                      <span>Change Entity</span>
                    </div>

                    {/* LOGOUT */}
                    <div
                      className="mini-profile-menu-item logout"
                      onClick={handleLogout}
                    >
                      <LogoutOutlined className="menu-icon red" />
                      <span>Logout</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          >
            <div className="header-user" style={{ cursor: "pointer" }}>
              <div className="user-avatar">{userInitial}</div>
            </div>
          </Dropdown>
        </div>
      </div>
    </header>
  );
};

export default Header;
