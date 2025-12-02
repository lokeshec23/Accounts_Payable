import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Switch, Badge, Dropdown } from 'antd';
import { SearchOutlined, BellOutlined, LogoutOutlined } from '@ant-design/icons';
import { authService } from '../services/auth';
import '../styles/Header.css';

const Header = () => {
    const [toggleChecked, setToggleChecked] = useState(false);
    const [username, setUsername] = useState('User');
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        // Get username from localStorage or use default
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUsername(user.username || user.email || 'User');
            } catch (e) {
                setUsername('User');
            }
        }
    }, []);

    const isActive = (path) => {
        // For exact match on dashboard, otherwise check if path starts with the route
        if (path === '/dashboard') {
            return location.pathname === path;
        }
        return location.pathname.startsWith(path);
    };

    const handleLogout = () => {
        authService.logout();
        navigate('/');
    };

    const userMenuItems = [
        {
            key: 'logout',
            label: 'Logout',
            icon: <LogoutOutlined />,
            onClick: handleLogout,
            danger: true,
        },
    ];

    // Get first letter of username
    const userInitial = username.charAt(0).toUpperCase();

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
                    <Link
                        to="/master-data"
                        className={`nav-tab ${isActive('/master-data') ? 'active' : ''}`}
                    >
                        Master Data
                    </Link>
                </nav>

                {/* Right Section - Icons */}
                <div className="header-actions">
                    {/* User Account with Dropdown */}
                    <Dropdown
                        menu={{ items: userMenuItems }}
                        placement="bottomRight"
                        trigger={['click']}
                    >
                        <div className="header-user" style={{ cursor: 'pointer' }}>
                            <div className="user-avatar">
                                {userInitial}
                            </div>
                        </div>
                    </Dropdown>
                </div>
            </div>
        </header>
    );
};

export default Header;