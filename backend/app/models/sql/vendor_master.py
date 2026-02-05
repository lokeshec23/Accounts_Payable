from sqlalchemy import Column, String, JSON, Integer
from app.models.sql.base import Base

class VendorMaster(Base):
    __tablename__ = "vendor_master"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(String(100), unique=True, index=True, nullable=False)
    vendor_name = Column(String(255), nullable=False)
    entity = Column(String(100), index=True)
    gst_eligibility = Column(String(50), default="Eligible")
    tds_applicability = Column(String(50), default="No")
    tds_percentage = Column(String(50))
    tds_description = Column(String(255))
    workflow_applicability = Column(String(50), default="Yes")
    line_grouping = Column(String(10), default="No")
    details = Column(JSON, nullable=True) # Full master data
