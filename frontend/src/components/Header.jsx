import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Switch, Badge } from 'antd';
import { SearchOutlined, BellOutlined, UserOutlined } from '@ant-design/icons';
import '../styles/Header.css';

const Header = () => {
    const [toggleChecked, setToggleChecked] = useState(false);
    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    return (
        <header className="app-header">
            <div className="header-container">
                {/* Logo Section */}
                <div className="header-logo">
                    <img src="/loandna-logo.png" alt="loanDNA" />
                </div>

                {/* Navigation Tabs */}
                <nav className="header-nav">
                    <Link
                        to="/dashboard"
                        className={`nav-tab ${isActive('/dashboard') ? 'active' : ''}`}
                    >
                        Dashboard
                    </Link>
                    <Link
                        to="/invoice"
                        className={`nav-tab ${isActive('/invoice') ? 'active' : ''}`}
                    >
                        Invoice
                    </Link>
                    <Link
                        to="/coding"
                        className={`nav-tab ${isActive('/coding') ? 'active' : ''}`}
                    >
                        Coding
                    </Link>
                    <Link
                        to="/approvals"
                        className={`nav-tab ${isActive('/approvals') ? 'active' : ''}`}
                    >
                        Approvals
                    </Link>
                </nav>

                {/* Right Section - Icons */}
                <div className="header-actions">
                    {/* Toggle Switch */}
                    <div className="header-toggle">
                        <Switch
                            checked={toggleChecked}
                            onChange={setToggleChecked}
                        />
                    </div>

                    {/* Search Icon */}
                    <button className="header-icon-btn" aria-label="Search">
                        <SearchOutlined />
                    </button>

                    {/* Notification Icon with Badge */}
                    <button className="header-icon-btn" aria-label="Notifications">
                        <Badge count={5} size="small">
                            <BellOutlined />
                        </Badge>
                    </button>

                    {/* User Account */}
                    <div className="header-user">
                        <div className="user-avatar">
                            <UserOutlined />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;