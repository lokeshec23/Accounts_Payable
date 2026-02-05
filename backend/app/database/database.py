from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from app.config.settings import settings
from typing import Generator

# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # Enable connection health checks
    pool_size=10,  # Connection pool size
    max_overflow=20,  # Maximum overflow connections
    echo=False,  # Set to True for SQL query logging during development
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for declarative models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function to get database session.
    Yields a database session and ensures it's closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database by creating all tables.
    Should be called on application startup.
    """
    from app.models import db_models  # Import models to register them
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully")


def get_database():
    """
    Legacy compatibility function.
    Returns a database session for backward compatibility with MongoDB code.
    This will be gradually replaced with get_db() dependency injection.
    """
    return SessionLocal()
