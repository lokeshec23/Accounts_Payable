import React from 'react';
import PropTypes from 'prop-types';

const NavHeader = ({
    logoSrc,
    links = [],
    userAvatarSrc,
    className = '',
    ...props
}) => {
    const containerStyle = {
        height: '64px', // Nav-bar Height 64px
        backgroundColor: '#FFFFFF',
        padding: '0 16px', // Padding 16px (Assuming horizontal padding, 16px vertical would make it taller than 64px if box-sizing is content-box, or fit if border-box)
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        fontFamily: 'var(--font-primary)',
        ...props.style
    };

    const leftSectionStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '24px' // Gap between logo and links
    };

    const logoStyle = {
        height: '32px', // Nav bar logo height 32px
        width: 'auto'
    };

    const linkStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        textDecoration: 'none',
        color: '#303030', // Nav link Text color #303030
        fontSize: '16px', // Nav link font size 16px
        padding: '8px 16px', // Nav link padding 16px
        cursor: 'pointer',
        borderRadius: '4px',
        transition: 'background-color 0.2s'
    };

    const iconStyle = {
        fontSize: '24px', // Nav link icon size 24px
        display: 'flex',
        alignItems: 'center'
    };

    // Avatar
    const avatarStyle = {
        width: '32px', // Nav bar Avatar size 32px
        height: '32px',
        borderRadius: '50%',
        objectFit: 'cover',
        backgroundColor: '#E0E0E0' // Placeholder
    };

    return (
        <header style={containerStyle} className={className}>
            <div style={leftSectionStyle}>
                {logoSrc && <img src={logoSrc} alt="Logo" style={logoStyle} />}

                <nav style={{ display: 'flex', alignItems: 'center' }}>
                    {links.map((link, index) => (
                        <a
                            key={index}
                            href={link.href || '#'}
                            style={linkStyle}
                            onClick={link.onClick}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            {link.icon && <span style={iconStyle}>{link.icon}</span>}
                            {link.label}
                        </a>
                    ))}
                </nav>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {userAvatarSrc ? (
                    <img src={userAvatarSrc} alt="User" style={avatarStyle} />
                ) : (
                    <div style={avatarStyle}></div>
                )}
            </div>
        </header>
    );
};

NavHeader.propTypes = {
    logoSrc: PropTypes.string,
    links: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string,
        href: PropTypes.string,
        icon: PropTypes.node,
        onClick: PropTypes.func
    })),
    userAvatarSrc: PropTypes.string,
    className: PropTypes.string,
};

export default NavHeader;
