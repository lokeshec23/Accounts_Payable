import React from 'react';
import PropTypes from 'prop-types';

const CheckBox = ({
    checked,
    onChange,
    label,
    disabled = false,
    className = '',
    ...props
}) => {
    // Styles
    const containerStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...props.style
    };

    const boxStyle = {
        width: '24px', // Size 24px
        height: '24px',
        borderRadius: '4px', // Standard small radius for checkboxes usually, though not explicitly 8px like buttons. Let's assume 4px or 2px. Buttons have 8px radius. Let's go with 4px for a 24px box.
        border: `1px solid ${checked ? '#24A1DD' : '#BBBBBB'}`, // Unselect border #BBBBBB, Selected #24A1DD
        backgroundColor: checked ? '#24A1DD' : '#FFFFFF', // Selected Color #24A1DD
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
    };

    const checkMarkStyle = {
        color: '#FFFFFF',
        fontSize: '16px',
        fontWeight: 'bold',
        opacity: checked ? 1 : 0,
        transform: checked ? 'scale(1)' : 'scale(0.5)',
        transition: 'all 0.2s ease',
    };

    const labelStyle = {
        fontFamily: 'var(--font-primary)',
        fontSize: '14px',
        color: '#303030',
    };

    return (
        <div
            style={containerStyle}
            className={className}
            onClick={() => !disabled && onChange(!checked)}
        >
            <div style={boxStyle}>
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={checkMarkStyle}
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
            {label && <span style={labelStyle}>{label}</span>}
        </div>
    );
};

CheckBox.propTypes = {
    checked: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.node,
    disabled: PropTypes.bool,
    className: PropTypes.string,
};

export default CheckBox;
