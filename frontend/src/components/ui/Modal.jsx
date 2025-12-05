import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    width = 'auto',
    height = 'auto',
    ...props
}) => {
    if (!isOpen) return null;

    // Prevent background scrolling
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)'
    };

    const modalStyle = {
        backgroundColor: '#FFFFFF',
        padding: '24px', // Padding : 24px
        borderRadius: '8px', // Border Radius: 8px
        boxShadow: '0px 20px 25px -5px rgba(0, 0, 0, 0.1)', // Shadow
        width: width,
        height: height,
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px', // Gap : 24px
        ...props.style
    };

    const headerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: title ? '0' : '-24px', // Adjust if no title
    };

    const titleStyle = {
        fontFamily: 'Jura, sans-serif', // Modal Header Font Family Jura
        fontSize: '20px', // Modal Header Font size 20px
        fontWeight: 500,
        color: '#303030',
        margin: 0,
        padding: '16px 0', // Modal Header Padding 16px (Assuming vertical)
    };

    const closeIconStyle = {
        cursor: 'pointer',
        fontSize: '20px', // Close Icon Size 20px
        padding: '10px', // Close Icon Padding 20px (Might be total area, let's give it hit area padding)
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#727272',
        background: 'transparent',
        border: 'none',
    };

    const modalContent = (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={headerStyle}>
                    {title && <h2 style={titleStyle}>{title}</h2>}
                    <button style={closeIconStyle} onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div style={{ flex: 1 }}>
                    {children}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};

Modal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.string,
    children: PropTypes.node,
    width: PropTypes.string,
    height: PropTypes.string,
};

export default Modal;
