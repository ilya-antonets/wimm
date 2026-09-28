import threading
from typing import Any

from sqlalchemy.orm import Session


class MLSuggester:
    """Singleton ML suggestion service. Stage 3 stub — suggest() fully implemented in Stage 6."""

    def __init__(self) -> None:
        self._cache_valid = False
        self._lock = threading.Lock()

    def invalidate(self, reason: str = "unspecified") -> None:
        with self._lock:
            self._cache_valid = False

    def suggest(self, db: Session, transaction_ids: list[int]) -> list[Any]:
        return []


_suggester: MLSuggester | None = None
_suggester_lock = threading.Lock()


def get_suggester() -> MLSuggester:
    global _suggester
    if _suggester is None:
        with _suggester_lock:
            if _suggester is None:
                _suggester = MLSuggester()
    return _suggester
