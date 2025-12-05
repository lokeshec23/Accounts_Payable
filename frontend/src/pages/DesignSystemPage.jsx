import React, { useState } from 'react';
import Button from '../components/ui/Button';
import InputField from '../components/ui/InputField';
import SelectField from '../components/ui/SelectField';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import NavHeader from '../components/ui/NavHeader';
import CheckBox from '../components/ui/CheckBox';
import Tabs from '../components/ui/Tabs';

const DesignSystemPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [selectValue, setSelectValue] = useState('');

    // Table Data
    const columns = [
        { title: 'S.No', dataIndex: 'sno', key: 'sno', sorter: true },
        { title: 'Vendor Name', dataIndex: 'vendor', key: 'vendor' },
        { title: 'Amount', dataIndex: 'amount', key: 'amount' },
        { title: 'Status', dataIndex: 'status', key: 'status' },
    ];

    const data = [
        { key: '1', sno: '01', vendor: 'Acme Corp', amount: '$1,200.00', status: 'Processed' },
        { key: '2', sno: '02', vendor: 'Globex', amount: '$450.50', status: 'Pending' },
        { key: '3', sno: '03', vendor: 'Soylent Corp', amount: '$3,400.00', status: 'Approved' },
    ];

    return (
        <div style={{ backgroundColor: '#F5F7FA', minHeight: '100vh' }}>
            <NavHeader
                logoSrc="/gc_logo.svg"
                links={[
                    { label: 'Dashboard', href: '#' },
                    { label: 'Invoices', href: '#' },
                    { label: 'Approvals', href: '#' }
                ]}
            />

            <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
                <h1 style={{ marginBottom: '40px', fontFamily: 'var(--font-heading)' }}>UI Design System</h1>

                {/* Buttons */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Buttons</h2>
                    <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h3>Primary</h3>
                            <Button size="large">Primary Large</Button>
                            <Button size="medium">Primary Medium</Button>
                            <Button size="small">Primary Small</Button>
                            <Button size="large" disabled>Disabled</Button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h3>Secondary</h3>
                            <Button variant="secondary" size="large">Secondary Large</Button>
                            <Button variant="secondary" size="medium">Secondary Medium</Button>
                            <Button variant="secondary" size="small">Secondary Small</Button>
                            <Button variant="secondary" size="large" disabled>Disabled</Button>
                        </div>
                    </div>
                </section>

                {/* Inputs */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Input Fields</h2>
                    <div style={{ display: 'flex', gap: '40px' }}>
                        <InputField
                            label="Text Field"
                            placeholder="Enter text..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                        />
                        <InputField
                            label="Error State"
                            placeholder="Error..."
                            error="This field is required"
                        />
                        <InputField
                            label="With Icon"
                            placeholder="Search..."
                            icon="🔍"
                        />
                    </div>
                </section>

                {/* Selects */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Dropdowns</h2>
                    <div style={{ display: 'flex', gap: '40px' }}>
                        <SelectField
                            label="Select Option"
                            options={[
                                { label: 'Option 1', value: '1' },
                                { label: 'Option 2', value: '2' },
                                { label: 'Option 3', value: '3' },
                            ]}
                            value={selectValue}
                            onChange={setSelectValue}
                        />
                        <SelectField
                            label="Error State"
                            error="Selection required"
                            onChange={() => { }}
                        />
                    </div>
                </section>

                {/* CheckBox & Tabs - New Section */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Additional Components (CheckBox & Tabs)</h2>

                    <div style={{ marginBottom: '32px' }}>
                        <h3>CheckBox</h3>
                        <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
                            <CheckBox checked={true} onChange={() => { }} label="Selected" />
                            <CheckBox checked={false} onChange={() => { }} label="Unselected" />
                            <CheckBox checked={true} onChange={() => { }} label="Disabled" disabled />
                        </div>
                    </div>

                    <div>
                        <h3>Tabs</h3>
                        <div style={{ marginTop: '16px' }}>
                            <Tabs
                                activeKey="1"
                                onChange={() => { }}
                                tabs={[
                                    { key: '1', label: 'Dashboard' },
                                    { key: '2', label: 'Invoices' },
                                    { key: '3', label: 'Approvals' },
                                ]}
                            />
                        </div>
                    </div>
                </section>

                {/* Cards */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Cards</h2>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <Card variant="main-blue" title="Total Invoices" value="1,240" style={{ width: '300px' }} />

                        <Card variant="main-white" title="Recent Activity" style={{ width: '300px' }}>
                            <p>This is a main card content paragraph. It uses the Jura font for the heading.</p>
                            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                                <Card variant="sub" value="85%" />
                                <Card variant="sub" value="+12%" />
                            </div>
                        </Card>
                    </div>
                </section>

                {/* Table */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Table</h2>
                    <Table
                        columns={columns}
                        dataSource={data}
                        pagination={false}
                    />
                </section>

                {/* Modal */}
                <section style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Modal</h2>
                    <Button onClick={() => setIsModalOpen(true)}>Open Demo Modal</Button>

                    <Modal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        title="Demo Modal"
                        width="500px"
                    >
                        <p>This is a modal complying with the new style guide.</p>
                        <p style={{ marginTop: '16px' }}>Padding: 24px, Radius: 8px.</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '16px' }}>
                            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                            <Button onClick={() => setIsModalOpen(false)}>Confirm</Button>
                        </div>
                    </Modal>
                </section>

            </div>
        </div>
    );
};

export default DesignSystemPage;
