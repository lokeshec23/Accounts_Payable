from sqlalchemy import Column, String, Integer, JSON, Numeric
from app.models.sql.base import Base

class EntityMaster(Base):
    __tablename__ = "entity_master"

    id = Column(Integer, primary_key=True, index=True)
    entity_id = Column(String(50), unique=True, index=True, nullable=False)
    entity_name = Column(String(200), nullable=False)
    entity_no = Column(String(50))
    details = Column(JSON, nullable=True)

class TDSRates(Base):
    __tablename__ = "tds_rates"
    id = Column(Integer, primary_key=True, index=True)
    section = Column(String(50))
    nature_of_payment = Column(String(200))
    rate = Column(Numeric(precision=12, scale=2))
    entity = Column(String(50))

class MasterRecord(Base):
    __tablename__ = "master_records"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), index=True) # e.g. "Line_Items", "Departments"
    data = Column(JSON, nullable=False)
    entity = Column(String(50), index=True)
