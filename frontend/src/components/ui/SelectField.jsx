import React, { useState } from 'react';
import PropTypes from 'prop-types';

const SelectField = ({
    label,
    options = [],
    value,
    onChange,
    error,
    placeholder = 'Select...',
    width = '320px',
    icon = null,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Since building a fully custom dropdown is complex and might clash with existing libs, 
    // I will initially implement this using a standard select styled as much as possible, 
    // OR a simple custom div-based dropdown. Given the visual requirements (hover colors, etc.),
    // a custom div based one is better, or wrapping standard select. 
    // Let's use a standard select for robustness first, but styled.
    // Wait, standard <select> styling is limited. The user wants specific hover colors for options.
    // "Dropdown Values Hover Color #E9F6FC". This requires a custom implementation (ul/li).

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: width,
        marginBottom: '16px',
        position: 'relative' // For dropdown absolute positioning
    };

    const labelStyle = {
        fontFamily: 'var(--font-primary)',
        fontWeight: 400,
        fontSize: '14px',
        color: '#303030',
    };

    const triggerStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 12px',
        backgroundColor: '#FFFFFF',
        border: error
            ? '1px solid var(--color-error)'
            : (isFocused || isOpen)
                ? '1px solid #9AD4EF'
                : '1px solid #E0E0E0',
        borderRadius: '8px',
        cursor: 'pointer',
        boxShadow: (isFocused || isOpen) ? 'none' : '0px 1px 2px #0000000F',
        transition: 'all 0.2s ease',
    };

    const valueStyle = {
        fontFamily: 'var(--font-primary)',
        fontSize: '14px',
        color: value ? '#303030' : '#969696',
        flex: 1,
    };

    const dropdownListStyle = {
        position: 'absolute',
        top: '100%',
        left: 0,
        width: '100%',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E0E0',
        borderRadius: '8px',
        marginTop: '4px',
        padding: '8px', // Dropdown Modal Padding 8px
        zIndex: 1000,
        boxShadow: '0px 4px 12px rgba(0,0,0,0.1)',
        maxHeight: '200px',
        overflowY: 'auto'
    };

    const errorStyle = {
        fontFamily: 'var(--font-primary)',
        fontSize: '14px',
        color: '#CA1C1F',
        marginTop: '4px',
    };

    const handleSelect = (optionValue) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div style={containerStyle} ref={(node) => {
            // Simple click outside handler logic could go here or use a hook
        }}>
            {label && <label style={labelStyle}>{label}</label>}

            <div
                style={triggerStyle}
                onClick={() => setIsOpen(!isOpen)}
                tabIndex={0}
                onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); setTimeout(() => setIsOpen(false), 200); }} // Delay to allow click
            >
                {icon && <span style={{ marginRight: '8px' }}>{icon}</span>}
                <span style={valueStyle}>
                    {options.find(opt => opt.value === value)?.label || placeholder}
                </span>
                <span style={{ fontSize: '12px', color: '#969696' }}>▼</span>
            </div>

            {isOpen && (
                <div style={dropdownListStyle}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            style={{
                                padding: '8px 12px',
                                fontSize: '14px',
                                color: value === option.value ? '#24A1DD' : '#303030', // Selected color
                                backgroundColor: value === option.value ? '#F0F8FF' : 'transparent',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                fontFamily: 'var(--font-primary)',
                            }}
                            onMouseEnter={(e) => {
                                if (value !== option.value) e.currentTarget.style.backgroundColor = '#E9F6FC'; // Hover color
                            }}
                            onMouseLeave={(e) => {
                                if (value !== option.value) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelect(option.value);
                            }}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}

            {error && <span style={errorStyle}>{error}</span>}
        </div>
    );
};

SelectField.propTypes = {
    label: PropTypes.string,
    options: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        value: PropTypes.any.isRequired
    })),
    value: PropTypes.any,
    onChange: PropTypes.func.isRequired,
    error: PropTypes.string,
    placeholder: PropTypes.string,
    width: PropTypes.string,
    icon: PropTypes.node
};

export default SelectField;
