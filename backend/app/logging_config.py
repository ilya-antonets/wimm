import json
import logging
import logging.config
import logging.handlers
import os
import traceback as tb
from typing import Any

from app.config import settings

TEXT_FORMAT = "%(asctime)s %(levelname)-8s %(name)s — %(message)s"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"

_STD_LOG_FIELDS = frozenset(vars(logging.LogRecord("", 0, "", 0, "", (), None)))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, DATE_FORMAT),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = tb.format_exception(*record.exc_info)
        for key, val in record.__dict__.items():
            if key not in _STD_LOG_FIELDS and not key.startswith("_"):
                payload[key] = val
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    formatter_key = "json" if settings.log_format == "json" else "text"

    os.makedirs(settings.log_dir, exist_ok=True)
    log_file = os.path.join(settings.log_dir, "wimm.log")

    stdout_handler: dict[str, Any] = {
        "class": "logging.StreamHandler",
        "stream": "ext://sys.stdout",
        "formatter": formatter_key,
    }
    file_handler: dict[str, Any] = {
        "class": "logging.handlers.RotatingFileHandler",
        "filename": log_file,
        "maxBytes": 10 * 1024 * 1024,
        "backupCount": 5,
        "encoding": "utf-8",
        "formatter": formatter_key,
    }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "text": {
                    "format": TEXT_FORMAT,
                    "datefmt": DATE_FORMAT,
                },
                "json": {
                    "()": "app.logging_config.JsonFormatter",
                },
            },
            "handlers": {
                "stdout": stdout_handler,
                "file": file_handler,
            },
            "loggers": {
                "app": {
                    "handlers": ["stdout", "file"],
                    "level": settings.log_level.upper(),
                    "propagate": False,
                },
                "sqlalchemy.engine": {
                    "handlers": ["stdout", "file"],
                    "level": "INFO" if settings.sql_echo else "WARNING",
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": ["stdout", "file"],
                    "level": "WARNING",
                    "propagate": False,
                },
            },
            "root": {
                "handlers": ["stdout", "file"],
                "level": "WARNING",
            },
        }
    )
