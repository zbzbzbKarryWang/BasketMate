import logging
from logging.handlers import RotatingFileHandler
import os

LOG_DIR = "/logs"
LOG_FILE = os.path.join(LOG_DIR, "app.log")

os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger("basketmate")
logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s.%(levelname)s %(name)s %(message)s", "%Y-%m-%d %H:%M:%S.%f")

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=10 * 1024 * 1024,
    backupCount=2,
    encoding="utf-8"
)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

def get_logger(name: str = "basketmate"):
    return logging.getLogger(name)
