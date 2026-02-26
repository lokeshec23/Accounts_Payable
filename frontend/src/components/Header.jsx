import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Dropdown } from "antd";
import { LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { authService } from "../services/auth";
import "../styles/Header.css";
import { useEntity } from "../context/EntityContext";
import { useGlobalSettings } from "../context/GlobalSettingsContext";

const Header = () => {
  const [username, setUsername] = useState("User");
  const { entity } = useEntity();
  const { settings } = useGlobalSettings();
  const [role, setRole] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
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
          {settings.navigation && settings.navigation.map((navItem) => {
            // Check if user has permission
            const hasPermission = navItem.roles.includes("all") || navItem.roles.includes(role);

            if (!hasPermission) return null;

            return (
              <Link
                key={navItem.path}
                to={navItem.path}
                className={`nav-tab ${isActive(navItem.path) ? "active" : ""}`}
              >
                {navItem.label}
              </Link>
            );
          })}
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
