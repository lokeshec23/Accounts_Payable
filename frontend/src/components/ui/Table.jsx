import React from 'react';
import { Table as AntTable } from 'antd';
import './Table.css';

const Table = React.memo((props) => {
    return (
        <div className="ui-table-container">
            <AntTable
                {...props}
                className={`ui-table ${props.className || ''}`}
            />
        </div>
    );
});

export default Table;
