import React, { useState, useEffect, useCallback } from "react";
import { Badge, Dropdown, Button } from "antd";
import { BellOutlined, UserOutlined, FileTextOutlined, CheckCircleOutlined, CheckSquareOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useEntity } from "../context/EntityContext";
import "../styles/NotificationBell.css";

const NotificationBell = () => {
    const [notifications, setNotifications] = useState({ total_count: 0, items: [] });
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const navigate = useNavigate();
    const { entity } = useEntity();

    const fetchNotifications = useCallback(async () => {
        try {
            const response = await api.get("/notifications");
            setNotifications(response.data);
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        }
    }, [entity]);

    useEffect(() => {
        if (!entity || entity === "Select Entity") return; // Avoid fetching before login/entity selection
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Poll every 30 seconds
        return () => clearInterval(interval);
    }, [fetchNotifications, entity]);

    const handleReadAll = async (e) => {
        e.stopPropagation();
        setLoading(true);
        try {
            await api.post("/notifications/read-all");
            // Instead of clearing, fetch the latest state
            // This ensures pending items stay visible but with unread_count = 0
            await fetchNotifications();
            setDropdownOpen(false);
        } catch (error) {
            console.error("Failed to mark all as read:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleItemClick = (link) => {
        navigate(link);
        setDropdownOpen(false);
    };

    return (
        <Dropdown
            dropdownRender={() => (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        {notifications.total_count > 0 && (
                            <Button
                                type="link"
                                size="small"
                                onClick={handleReadAll}
                                loading={loading}
                                icon={<CheckSquareOutlined />}
                            >
                                Mark all as read
                            </Button>
                        )}
                    </div>
                    <div className="notification-body">
                        {notifications.items.length > 0 ? (
                            <div className="notification-list">
                                {notifications.items.map(item => (
                                    <div key={item.id} className={`notification-item ${item.is_unread ? 'unread' : ''}`} onClick={() => handleItemClick(item.link)}>
                                        <div className={`notification-icon-wrapper ${item.type}`}>
                                            {item.type === 'admin' && <UserOutlined />}
                                            {item.type === 'coding' && <FileTextOutlined />}
                                            {item.type === 'approval' && <CheckCircleOutlined />}
                                        </div>
                                        <div className="notification-content">
                                            <div className="notification-message-row">
                                                <span className="notification-message">{item.message}</span>
                                                {item.is_unread && <span className="unread-dot"></span>}
                                            </div>
                                            <span className="notification-time">
                                                {new Date(item.timestamp).toLocaleString([], {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="no-notifications">
                                <BellOutlined style={{ fontSize: '24px', color: '#ccc', marginBottom: '8px' }} />
                                <p>No new notifications</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            trigger={["click"]}
            open={dropdownOpen}
            onOpenChange={setDropdownOpen}
            placement="bottomRight"
        >
            <div className="notification-bell-container">
                <Badge count={notifications.total_count} size="small" offset={[-2, 2]} className="custom-notification-badge">
                    <BellOutlined className="header-icon notification-bell" />
                </Badge>
            </div>
        </Dropdown>
    );
};

export default NotificationBell;
