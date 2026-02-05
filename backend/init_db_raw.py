from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env")
    exit(1)

# Use synchronous engine
engine = create_engine(DATABASE_URL)

tables_sql = [
    # 1. users
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[users]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [users] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [username] NVARCHAR(50) NOT NULL,
            [email] NVARCHAR(100) NOT NULL,
            [password] NVARCHAR(255) NOT NULL,
            [role] NVARCHAR(20) DEFAULT 'user',
            [status] NVARCHAR(20) DEFAULT 'pending',
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id]),
            UNIQUE ([username]),
            UNIQUE ([email])
        );
        CREATE INDEX [ix_users_id] ON [users] ([id]);
    END
    """,
    # 2. invoices
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[invoices]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [invoices] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [filename] NVARCHAR(255) NOT NULL,
            [original_filename] NVARCHAR(255) NOT NULL,
            [file_path] NVARCHAR(500) NOT NULL,
            [uploaded_by] NVARCHAR(50) NOT NULL,
            [status] NVARCHAR(50) DEFAULT 'waiting_approval',
            [uploaded_at] DATETIME DEFAULT GETDATE(),
            [processed_at] DATETIME NULL,
            [entity] NVARCHAR(100) NULL,
            [extracted_data] NVARCHAR(MAX) NULL,
            [status_history] NVARCHAR(MAX) NULL,
            [validation_results] NVARCHAR(MAX) NULL,
            [duplicate_info] NVARCHAR(MAX) NULL,
            [original_items] NVARCHAR(MAX) NULL,
            [gl_summary] NVARCHAR(MAX) NULL,
            [vendor_id] NVARCHAR(100) NULL,
            [vendor_name] NVARCHAR(255) NULL,
            [invoice_number] NVARCHAR(100) NULL,
            [confidence_score] NVARCHAR(20) NULL,
            [exchange_rate] NUMERIC(10,4) NULL,
            [required_approvers] INT NULL,
            [current_approver_level] INT DEFAULT 1,
            [approved_by] NVARCHAR(MAX) NULL,
            [assigned_approvers] NVARCHAR(MAX) NULL,
            [approver_breakdown] NVARCHAR(MAX) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_invoices_id] ON [invoices] ([id]);
    END
    """,
    # 3. vendor_master
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[vendor_master]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [vendor_master] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [vendor_id] NVARCHAR(100) NOT NULL,
            [vendor_name] NVARCHAR(255) NOT NULL,
            [entity] NVARCHAR(100) NULL,
            [gst_eligibility] NVARCHAR(50) DEFAULT 'Eligible',
            [tds_applicability] NVARCHAR(50) DEFAULT 'No',
            [tds_percentage] NVARCHAR(50) NULL,
            [tds_description] NVARCHAR(255) NULL,
            [workflow_applicability] NVARCHAR(50) DEFAULT 'Yes',
            [line_grouping] NVARCHAR(10) DEFAULT 'No',
            [details] NVARCHAR(MAX) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id]),
            UNIQUE ([vendor_id])
        );
        CREATE INDEX [ix_vendor_master_id] ON [vendor_master] ([id]);
        CREATE INDEX [ix_vendor_master_vendor_id] ON [vendor_master] ([vendor_id]);
    END
    """,
    # 4. workflow_steps
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[workflow_steps]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [workflow_steps] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [invoice_id] NVARCHAR(50) NOT NULL,
            [step_name] NVARCHAR(100) NOT NULL,
            [step_type] NVARCHAR(50) NOT NULL,
            [user] NVARCHAR(50) NULL,
            [status] NVARCHAR(50) NOT NULL,
            [timestamp] DATETIME DEFAULT GETDATE(),
            [approver_number] INT NULL,
            [comment] NVARCHAR(500) NULL,
            [entity] NVARCHAR(100) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_workflow_steps_id] ON [workflow_steps] ([id]);
        CREATE INDEX [ix_workflow_steps_invoice_id] ON [workflow_steps] ([invoice_id]);
    END
    """,
    # 5. coding
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[coding]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [coding] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [invoice_id] NVARCHAR(50) NULL,
            [line_items] NVARCHAR(MAX) NULL,
            [total_amount] NUMERIC(12,2) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME NULL,
            [entity] NVARCHAR(50) NULL,
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_coding_id] ON [coding] ([id]);
        CREATE INDEX [ix_coding_invoice_id] ON [coding] ([invoice_id]);
    END
    """,
    # 6. coding_history
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[coding_history]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [coding_history] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [vendor_key] NVARCHAR(255) NULL,
            [vendor_name] NVARCHAR(255) NULL,
            [description] NVARCHAR(1000) NULL,
            [normalized_description] NVARCHAR(1000) NULL,
            [embedding] NVARCHAR(MAX) NULL,
            [coding] NVARCHAR(MAX) NULL,
            [updated_at] DATETIME DEFAULT GETDATE(),
            [entity] NVARCHAR(50) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_coding_history_id] ON [coding_history] ([id]);
        CREATE INDEX [ix_coding_history_vendor_key] ON [coding_history] ([vendor_key]);
        CREATE INDEX [ix_coding_history_normalized_description] ON [coding_history] ([normalized_description]);
    END
    """,
    # 7. entity_master
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[entity_master]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [entity_master] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [entity_id] NVARCHAR(50) NOT NULL,
            [entity_name] NVARCHAR(200) NOT NULL,
            [entity_no] NVARCHAR(50) NULL,
            [details] NVARCHAR(MAX) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id]),
            UNIQUE ([entity_id])
        );
        CREATE INDEX [ix_entity_master_id] ON [entity_master] ([id]);
        CREATE INDEX [ix_entity_master_entity_id] ON [entity_master] ([entity_id]);
    END
    """,
    # 8. tds_rates
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[tds_rates]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [tds_rates] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [section] NVARCHAR(50) NULL,
            [nature_of_payment] NVARCHAR(200) NULL,
            [rate] NUMERIC(12,2) NULL,
            [entity] NVARCHAR(50) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_tds_rates_id] ON [tds_rates] ([id]);
    END
    """,
    # 9. master_records
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[master_records]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [master_records] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [category] NVARCHAR(50) NULL,
            [data] NVARCHAR(MAX) NOT NULL,
            [entity] NVARCHAR(50) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_master_records_id] ON [master_records] ([id]);
        CREATE INDEX [ix_master_records_category] ON [master_records] ([category]);
    END
    """,
    # 10. delegations
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[delegations]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [delegations] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [original_approver] NVARCHAR(100) NOT NULL,
            [substitute_approver] NVARCHAR(100) NOT NULL,
            [start_date] DATETIME NOT NULL,
            [end_date] DATETIME NOT NULL,
            [entity] NVARCHAR(50) NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [created_by] NVARCHAR(50) NULL,
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_delegations_id] ON [delegations] ([id]);
        CREATE INDEX [ix_delegations_original_approver] ON [delegations] ([original_approver]);
    END
    """,
    # 11. currencies
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[currencies]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [currencies] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [name] NVARCHAR(50) NOT NULL,
            [symbol] NVARCHAR(10) NOT NULL,
            [code] NVARCHAR(5) NOT NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id]),
            UNIQUE ([code])
        );
        CREATE INDEX [ix_currencies_id] ON [currencies] ([id]);
    END
    """,
    # 12. global_settings
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[global_settings]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [global_settings] (
            [config_key] NVARCHAR(50) NOT NULL,
            [settings_data] NVARCHAR(MAX) NOT NULL,
            [id] INT IDENTITY(1,1) NOT NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([config_key])
        );
    END
    """,
    # 13. audit_logs
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[audit_logs]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [audit_logs] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [invoice_id] NVARCHAR(50) NULL,
            [action] NVARCHAR(100) NOT NULL,
            [user] NVARCHAR(50) NOT NULL,
            [entity] NVARCHAR(100) NULL,
            [details] NVARCHAR(MAX) NULL,
            [timestamp] DATETIME DEFAULT GETDATE(),
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_audit_logs_id] ON [audit_logs] ([id]);
        CREATE INDEX [ix_audit_logs_invoice_id] ON [audit_logs] ([invoice_id]);
    END
    """,
    # 14. vendor_workflows
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[vendor_workflows]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [vendor_workflows] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [vendor_id] NVARCHAR(50) NULL,
            [vendor_name] NVARCHAR(200) NULL,
            [entity] NVARCHAR(50) NULL,
            [approver_count] INT DEFAULT 3,
            [mandatory_approver_1] NVARCHAR(100) NULL,
            [mandatory_approver_2] NVARCHAR(100) NULL,
            [mandatory_approver_3] NVARCHAR(100) NULL,
            [amount_threshold] NUMERIC(12,2) DEFAULT 0.0,
            [threshold_approver] NVARCHAR(100) NULL,
            [optional_approver] NVARCHAR(100) NULL,
            [updated_at] DATETIME DEFAULT GETDATE(),
            [created_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_vendor_workflows_id] ON [vendor_workflows] ([id]);
        CREATE INDEX [ix_vendor_workflows_vendor_id] ON [vendor_workflows] ([vendor_id]);
    END
    """,
    # 15. codification_workflows
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[codification_workflows]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [codification_workflows] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [lob] NVARCHAR(100) NULL,
            [department_id] NVARCHAR(100) NULL,
            [entity] NVARCHAR(50) NULL,
            [approver_count] INT DEFAULT 3,
            [mandatory_approver_1] NVARCHAR(100) NULL,
            [mandatory_approver_2] NVARCHAR(100) NULL,
            [mandatory_approver_3] NVARCHAR(100) NULL,
            [amount_threshold] NUMERIC(12,2) DEFAULT 0.0,
            [threshold_approver] NVARCHAR(100) NULL,
            [optional_approver] NVARCHAR(100) NULL,
            [updated_at] DATETIME DEFAULT GETDATE(),
            [created_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_codification_workflows_id] ON [codification_workflows] ([id]);
    END
    """,
    # 16. invoice_registry
    """
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[invoice_registry]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [invoice_registry] (
            [id] INT IDENTITY(1,1) NOT NULL,
            [invoice_id] INT NOT NULL,
            [vendor_id] NVARCHAR(100) NOT NULL,
            [invoice_number] NVARCHAR(100) NOT NULL,
            [entity] NVARCHAR(100) NOT NULL,
            [uploaded_at] DATETIME DEFAULT GETDATE(),
            [uploaded_by] NVARCHAR(50) NOT NULL,
            [created_at] DATETIME DEFAULT GETDATE(),
            [updated_at] DATETIME DEFAULT GETDATE(),
            PRIMARY KEY ([id])
        );
        CREATE INDEX [ix_invoice_registry_id] ON [invoice_registry] ([id]);
        CREATE INDEX [ix_invoice_registry_invoice_id] ON [invoice_registry] ([invoice_id]);
    END
    """
]

print("Initializing database tables using raw SQL...")

try:
    with engine.connect() as conn:
        for sql in tables_sql:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"Error executing statement: {e}")
    print("\n✓ Database initialization complete!")
except Exception as e:
    print(f"\nCritical Error connecting to database: {e}")
