import logging
import sys
from logging.handlers import RotatingFileHandler

def setup_logger():
    logger = logging.getLogger("ai_app")
    logger.setLevel(logging.INFO)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    # File handler (rotates after 5MB)
    file_handler = RotatingFileHandler(
        "app.log", maxBytes=5*1024*1024, backupCount=3
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger

# Instantiate the logger so it can be imported
logger = setup_logger()
