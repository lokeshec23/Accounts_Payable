import React, { useState } from 'react';
import PropTypes from 'prop-types';

const InputField = ({
    label,
    placeholder,
    value,
    onChange,
    error,
    type = 'text',
    width = '320px',
    icon = null,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);

    // Styles
    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px', // Gap between label and input not explicitly specified but good practice.
        width: width,
        marginBottom: '16px', // Default spacing
    };

    const labelStyle = {
        fontFamily: 'var(--font-primary)',
        fontWeight: 400,
        fontSize: '14px',
        color: '#303030',
    };

    const inputWrapperStyle = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
    };

    const inputStyle = {
        width: '100%',
        padding: '8px 12px', // Placeholder padding: 8, 12px
        fontFamily: 'var(--font-primary)',
        fontSize: '14px',
        backgroundColor: '#FFFFFF',
        border: error
            ? '1px solid var(--color-error)'
            : isFocused
                ? '1px solid #9AD4EF' // Placeholder Active Border Color
                : '1px solid #E0E0E0',
        borderRadius: '8px',
        color: '#303030',
        boxShadow: isFocused ? 'none' : '0px 1px 2px #0000000F',
        outline: 'none',
        transition: 'all 0.2s ease',
        // Icon handling
        paddingLeft: icon ? '36px' : '12px', // Adjust padding if icon exists
    };

    const iconStyle = {
        position: 'absolute',
        left: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '20px',
        height: '20px',
        backgroundColor: '#F7F7F7', // Icon Background color
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px', // Assuming small radius for icon bg
        color: '#303030',
        zIndex: 1,
    };

    const errorStyle = {
        fontFamily: 'var(--font-primary)',
        fontSize: '14px',
        color: '#CA1C1F', // Font Color: #CA1C1F
        marginTop: '4px',
    };

    return (
        <div style={containerStyle}>
            {label && <label style={labelStyle}>{label}</label>}
            <div style={inputWrapperStyle}>
                {icon && <div style={iconStyle}>{icon}</div>}
                <input
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    style={inputStyle}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    {...props}
                />
            </div>
            {error && <span style={errorStyle}>{error}</span>}
        </div>
    );
};

InputField.propTypes = {
    label: PropTypes.string,
    placeholder: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onChange: PropTypes.func,
    error: PropTypes.string,
    type: PropTypes.string,
    width: PropTypes.string,
    icon: PropTypes.node,
};

export default InputField;
