import React from 'react';
import PropTypes from 'prop-types';

const Card = ({
    variant = 'main-white', // 'main-blue', 'main-white', 'sub'
    children,
    title, // Optional title/label
    value, // Optional value for blue cards/sub cards
    infoIcon = null,
    className = '',
    ...props
}) => {
    const baseStyle = {
        borderRadius: '12px', // Border Radius 12px (Global or Sub Card specific, applying broadly for consistency or variant specific)
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: variant !== 'sub' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
    };

    const variants = {
        'main-blue': {
            backgroundColor: '#11699E', // Main Blue Card Color
            padding: '16px', // Main Blue Card Padding 16px
            color: '#FFFFFF',
        },
        'main-white': {
            backgroundColor: '#FFFFFF', // Main Card Color
            padding: '16px', // Main Card Padding 16px
            color: '#303030', // Default text
        },
        'sub': {
            // Assuming light bg for sub card? Or White? "Sub Card Padding 12px". Let's assume white or context dependent. 
            // Spec doesn't explicitly say sub card BG, but usually inside Main Card.
            // Let's use transparent or white with border? 
            // Re-reading: "Sub Card Value Color #24A1DD".
            // Let's default to a light border or bg. I'll use white with a border for now or just padding.
            // Wait, "Border Radius 12px" is listed under Sub Card/General.
            backgroundColor: '#FFFFFF',
            border: '1px solid #E0E0E0',
            padding: '12px', // Sub Card Padding 12px
        }
    };

    const currentVariant = variants[variant] || variants['main-white'];

    // Content Styles
    const labelStyle = {
        fontFamily: variant === 'main-blue' ? 'Creato Display' : 'Jura', // Blue: Label size 16px (Creato likely), White: Heading Font Jura
        fontWeight: variant === 'main-blue' ? 400 : 500,
        fontSize: variant === 'sub' ? '12px' : '16px', // Blue Label 16px, Sub Label 12px, White Heading 16px
        color: variant === 'main-blue' ? '#FFFFFF' : '#222222', // Blue Label White, White Heading #222222
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    };

    const valueStyle = {
        fontFamily: 'Creato Display',
        fontWeight: 600,
        fontSize: variant === 'main-blue' ? '32px' : (variant === 'sub' ? '18px' : '16px'), // Blue Value 32px, Sub Value 18px
        color: variant === 'sub' ? '#24A1DD' : (variant === 'main-blue' ? '#FFFFFF' : '#303030'), // Sub Value #24A1DD
    };

    const paragraphStyle = {
        fontSize: '12px', // Main Card paragraph size 12px
        color: '#303030',
    };

    return (
        <div
            style={{ ...baseStyle, ...currentVariant, ...props.style }}
            className={className}
        >
            {/* Header/Title Section */}
            {(title || infoIcon) && (
                <div style={labelStyle}>
                    {title}
                    {infoIcon && <span style={{ fontSize: '16px' }}>{infoIcon}</span>}
                </div>
            )}

            {/* Value Section */}
            {value && <div style={valueStyle}>{value}</div>}

            {/* Children/Body */}
            <div style={variant === 'main-white' ? paragraphStyle : {}}>
                {children}
            </div>
        </div>
    );
};

Card.propTypes = {
    variant: PropTypes.oneOf(['main-blue', 'main-white', 'sub']),
    title: PropTypes.node,
    value: PropTypes.node,
    infoIcon: PropTypes.node,
    children: PropTypes.node,
    className: PropTypes.string,
};

export default Card;
