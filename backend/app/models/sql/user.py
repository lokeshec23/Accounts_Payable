from sqlalchemy import Column, String, DateTime
from app.models.sql.base import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), default="coder")  # admin, coder, approver, user
    status = Column(String(20), default="pending")  # pending, active, rejected
