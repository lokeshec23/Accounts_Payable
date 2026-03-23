import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Dropdown } from "antd";
import { LogoutOutlined, SettingOutlined, SunFilled, MoonFilled, QuestionCircleOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { authService } from "../services/auth";
import "../styles/Header.css";
import { useEntity } from "../context/EntityContext";
import { useGlobalSettings } from "../context/GlobalSettingsContext";
import { useTheme } from "../context/ThemeContext";

const Header = () => {
  const [username, setUsername] = useState("User");
  const { entity } = useEntity();
  const { settings } = useGlobalSettings();
  const { isDarkMode, toggleTheme } = useTheme();
  const [role, setRole] = useState("");
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
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
          <img src={isDarkMode ? "/image.png" : "/loandna-logo.png"} alt="loanDNA" />
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
          <div
            className="user-guide-link"
            onClick={() => setIsGuideModalOpen(true)}
            title="User Guide"
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 12px",
              borderRadius: "20px",
              background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
              transition: "all 0.3s ease",
              marginRight: "8px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkMode ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)";
            }}
          >
            <QuestionCircleOutlined style={{ fontSize: "16px", color: isDarkMode ? "#fff" : "#303030" }} />
            <span style={{ fontSize: "14px", fontWeight: 500, color: isDarkMode ? "#fff" : "#303030" }}>User Guide</span>
          </div>

          <div
            className={`theme-switch ${isDarkMode ? "dark" : "light"}`}
            onClick={toggleTheme}
            title="Toggle Theme"
          >
            <div className="switch-track">
              <div className="switch-thumb">
                {isDarkMode ? <MoonFilled /> : <SunFilled />}
              </div>
            </div>
          </div>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            dropdownRender={() => (
              <div className="dropdown-wrapper">
                {/* ARROW POINTER */}
                <div className="dropdown-arrow"></div>

                {/* DROPDOWN CARD */}
                <div className="mini-profile-dropdown">

                  <div className="mini-profile-top">
                    <span className="mini-profile-entity">{entity}</span>

                    <span
                      className="mini-profile-logout"
                      onClick={handleLogout}
                    >
                      Logout
                    </span>
                  </div>
                  {/* BOX AVATAR */}
                  {/* <div className="mini-profile-avatar-box">{userInitial}</div> */}

                  {/* ENTITY NAME */}
                  {/* <div className="mini-profile-entity">{entity}</div> */}

                  {/* MENU */}
                  {/* <div className="mini-profile-menu"> */}

                  {/* USER INFO */}
                  <div className="mini-profile-divider"></div>

                  <div className="mini-profile-user">
                    <div className="mini-profile-avatar-box">{userInitial}</div>

                    <div className="mini-profile-details">
                      <div className="mini-profile-name">{username}</div>
                      <div className="mini-profile-role">{role}</div>
                    </div>
                  </div>


                  {/* DIVIDER */}
                  <div className="mini-profile-divider-line"></div>

                  {/* CHANGE ENTITY */}
                  <div
                    className="mini-profile-change"
                    onClick={() => navigate("/select-entity")}
                  >
                    <SettingOutlined className="menu-icon blue" />
                    <span>Change Entity</span>
                  </div>



                  {/* CHANGE ENTITY
                    <div
                      className="mini-profile-menu-item"
                      onClick={() => navigate("/select-entity")}
                    >
                      <SettingOutlined className="menu-icon blue" />
                      <span>Change Entity</span>
                    </div> */}

                  {/* LOGOUT */}
                  {/* <div
                      className="mini-profile-menu-item logout"
                      onClick={handleLogout}
                    >
                      <LogoutOutlined className="menu-icon red" />
                      <span>Logout</span>
                    </div> */}

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
      <Modal
        title="AP User Guide"
        open={isGuideModalOpen}
        onCancel={() => setIsGuideModalOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ 
          body: { height: "calc(100vh - 120px)", padding: 0, overflow: "hidden" },
          mask: { backdropFilter: "blur(4px)" }
        }}
      >
        <iframe
          src="/AP_User_Guide.pdf#view=FitH"
          title="AP User Guide"
          width="100%"
          height="100%"
          style={{ border: "none" }}
        />
      </Modal>
    </header>
  );
};

export default Header;
