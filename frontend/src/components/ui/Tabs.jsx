import React, { useState } from 'react';
import PropTypes from 'prop-types';

const Tabs = ({
    tabs = [], // [{ label: 'Tab 1', key: '1', icon: <Node /> }]
    activeKey,
    onChange,
    className = '',
    ...props
}) => {
    const containerStyle = {
        display: 'flex',
        borderBottom: '1px solid #E0E0E0', // Tab Border color #E0E0E0, Size 1px
        width: '100%',
        fontFamily: 'var(--font-primary)',
        ...props.style
    };

    const tabStyle = (isActive) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 24px', // Not strictly specified but needed for click area. Spec says "Tab font size 16px".
        cursor: 'pointer',
        fontSize: '16px', // Tab font size 16px
        color: isActive ? '#11699E' : '#303030', // Active not explicitly distinct in color besides maybe hover/underline? 
        // Spec: "Tab font color #303030", "Tab hover text color #11699E". 
        // Usually Active state matches Hover or Brand color. Let's use #11699E for active too.
        borderBottom: isActive ? '2px solid #11699E' : '2px solid transparent',
        transition: 'all 0.2s ease',
        backgroundColor: 'transparent',
        outline: 'none',
    });

    const iconStyle = {
        fontSize: '24px', // Tab icon size 24px
        display: 'flex',
        alignItems: 'center',
    };

    return (
        <div style={containerStyle} className={className}>
            {tabs.map((tab) => {
                const isActive = activeKey === tab.key;
                return (
                    <div
                        key={tab.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => onChange(tab.key)}
                        style={tabStyle(isActive)}
                        onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.color = '#11699E';
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.color = '#303030';
                        }}
                    >
                        {tab.icon && <span style={iconStyle}>{tab.icon}</span>}
                        <span>{tab.label}</span>
                    </div>
                );
            })}
        </div>
    );
};

Tabs.propTypes = {
    tabs: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        key: PropTypes.string.isRequired,
        icon: PropTypes.node
    })),
    activeKey: PropTypes.string,
    onChange: PropTypes.func,
    className: PropTypes.string,
};

export default Tabs;
