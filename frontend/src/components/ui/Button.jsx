import React from 'react';
import PropTypes from 'prop-types';

const Button = React.memo(({
    children,
    variant = 'primary',
    size = 'large',
    icon = null,
    disabled = false,
    className = '',
    onClick,
    ...props
}) => {
    const baseStyles = {
        fontFamily: 'var(--font-primary)',
        fontWeight: 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease-in-out',
        gap: '8px',
        border: 'none',
        outline: 'none',
    };

    const variants = {
        primary: {
            backgroundColor: disabled ? '#E0E0E0' : 'var(--color-primary)',
            color: disabled ? '#727272' : '#FFFFFF',
            border: 'none',
            hover: {
                backgroundColor: disabled ? '#E0E0E0' : 'var(--color-primary-hover)',
            }
        },
        secondary: {
            backgroundColor: disabled ? '#E0E0E0' : '#FFFFFF',
            color: disabled ? '#727272' : '#303030',
            border: disabled ? 'none' : '1px solid var(--color-primary)',
            hover: {
                backgroundColor: disabled ? '#E0E0E0' : 'var(--color-bg-hover)',
            }
        }
    };

    const sizes = {
        large: {
            fontSize: '18px',
            padding: '16px',
            borderRadius: '8px',
            iconSize: '24px'
        },
        medium: {
            fontSize: '16px',
            padding: '12px 16px', // "16,12px" usually means vertical horizontal or TRBL. Standard is often Y X. Let's assume 12px vertical 16px horizontal or vice versa. The spec says "16,12px". Usually top-bottom, left-right. Let's try 12px 16px. Re-reading spec: Padding: 16,12px. It might mean 16px padding all around or 16px top/bottom, 12px left/right. Let's go with 12px top/bottom 16px left/right as 16px all around is Large.
            borderRadius: '8px',
            iconSize: '20px'
        },
        small: {
            fontSize: '14px',
            padding: '8px',
            borderRadius: '4px',
            iconSize: '20px'
        }
    };

    const currentVariant = variants[variant] || variants.primary;
    const currentSize = sizes[size] || sizes.large;

    const [isHovered, setIsHovered] = React.useState(false);

    const mergedStyles = {
        ...baseStyles,
        ...currentVariant,
        ...currentSize,
        ...(isHovered && !disabled ? currentVariant.hover : {}),
        // Override specific props that are not style properties if needed, but here we just spread into style
    };

    // Extract non-style props like iconSize to avoid passing to DOM
    const { iconSize, ...domStyles } = mergedStyles;

    // Explicitly specific styles implementation to ensure override works
    const styleProp = {
        backgroundColor: mergedStyles.backgroundColor,
        color: mergedStyles.color,
        fontSize: mergedStyles.fontSize,
        fontWeight: baseStyles.fontWeight,
        fontFamily: baseStyles.fontFamily,
        padding: mergedStyles.padding,
        borderRadius: mergedStyles.borderRadius,
        border: mergedStyles.border,
        cursor: mergedStyles.cursor,
        display: baseStyles.display,
        gap: baseStyles.gap,
        alignItems: baseStyles.alignItems,
        justifyContent: baseStyles.justifyContent,
        transition: baseStyles.transition,
        ...props.style
    };

    return (
        <button
            className={`ui-button ${className}`}
            disabled={disabled}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={styleProp}
            {...props}
        >
            {icon && (
                <span style={{ display: 'flex', alignItems: 'center', fontSize: iconSize, color: variant === 'secondary' ? 'var(--color-primary)' : 'inherit' }}>
                    {icon}
                </span>
            )}
            {children}
        </button>
    );
});

Button.propTypes = {
    children: PropTypes.node,
    variant: PropTypes.oneOf(['primary', 'secondary']),
    size: PropTypes.oneOf(['large', 'medium', 'small']),
    icon: PropTypes.node,
    disabled: PropTypes.bool,
    className: PropTypes.string,
    onClick: PropTypes.func,
};

export default Button;
