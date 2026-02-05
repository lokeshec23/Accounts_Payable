from sqlalchemy import Column, String, UnicodeText, Integer, DateTime
from sqlalchemy.types import TypeDecorator
from app.models.sql.base import Base
from datetime import datetime
import json

class JSONText(TypeDecorator):
    """Represents an immutable structure as a json-encoded string."""
    impl = UnicodeText

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return json.loads(value)

class Currency(Base):
    __tablename__ = "currencies"
    name = Column(String(50), nullable=False)
    symbol = Column(String(10), nullable=False)
    code = Column(String(5), nullable=False, unique=True)

class GlobalSettings(Base):
    __tablename__ = "global_settings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(50), nullable=False, unique=True)
    settings_data = Column(JSONText, nullable=False)
    # Override datetime columns to avoid precision issues with legacy ODBC driver
    created_at = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)
