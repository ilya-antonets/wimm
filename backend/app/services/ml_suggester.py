import re
import threading
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Category, Mapping, Transaction
from app.schemas.suggestions import SuggestionResult

_NON_ALPHA = re.compile(r"[^A-Z ]")
_MULTISPACE = re.compile(r" +")


def _normalize(description: str) -> str:
    """Canonicalize a payee description for exact-match lookup."""
    text = _NON_ALPHA.sub("", description.upper())
    return _MULTISPACE.sub(" ", text).strip()


class MLSuggester:
    """Singleton ML suggestion service.

    Rebuilds a TF-IDF model on demand from manually-confirmed mappings. Two-phase
    suggestion: (1) exact normalized-payee lookup → confidence 1.0; (2) TF-IDF
    cosine similarity over the training corpus.
    """

    def __init__(self) -> None:
        self._cache_valid = False
        self._lock = threading.Lock()
        self._vectorizer: Any = None
        self._train_matrix: Any = None
        self._train_labels: list[int] = []
        self._exact_cache: dict[str, int] = {}

    def invalidate(self, reason: str = "unspecified") -> None:
        with self._lock:
            self._cache_valid = False

    def _rebuild_cache(self, db: Session) -> None:
        with self._lock:
            if self._cache_valid:  # another thread rebuilt while we waited
                return

            rows = db.execute(
                select(Transaction.description, Mapping.category_id).join(
                    Mapping, Mapping.transaction_id == Transaction.id
                )
            ).all()

            if len(rows) < settings.ml_min_training_samples:
                self._vectorizer = None
                self._train_matrix = None
                self._train_labels = []
                self._exact_cache = {}
                self._cache_valid = True
                return

            descriptions = [str(r[0]) for r in rows]
            labels = [int(r[1]) for r in rows]

            self._exact_cache = {
                _normalize(desc): cat_id for desc, cat_id in zip(descriptions, labels, strict=True)
            }

            vectorizer = TfidfVectorizer(
                analyzer="word",
                ngram_range=(settings.ml_ngram_min, settings.ml_ngram_max),
                max_features=settings.ml_max_features,
                sublinear_tf=True,
            )
            self._train_matrix = vectorizer.fit_transform(descriptions)
            self._vectorizer = vectorizer
            self._train_labels = labels
            self._cache_valid = True

    def suggest(self, db: Session, transaction_ids: list[int]) -> list[SuggestionResult]:
        if not self._cache_valid:
            self._rebuild_cache(db)

        transactions = db.scalars(
            select(Transaction).where(Transaction.id.in_(transaction_ids))
        ).all()
        tx_by_id = {tx.id: tx for tx in transactions}

        results: list[SuggestionResult] = []
        for tx_id in transaction_ids:
            tx = tx_by_id.get(tx_id)
            if tx is None:
                continue
            result = self._suggest_one(db, tx)
            if result is not None:
                results.append(result)
        return results

    def _suggest_one(self, db: Session, tx: Transaction) -> SuggestionResult | None:
        if self._train_matrix is None or self._vectorizer is None:
            return None

        normalized = _normalize(tx.description)

        # Phase 1 — exact payee match.
        exact_category = self._exact_cache.get(normalized)
        if exact_category is not None:
            name = self._category_name(db, exact_category)
            if name is None:
                return None
            return SuggestionResult(
                transaction_id=tx.id,
                suggested_category_id=exact_category,
                suggested_category_name=name,
                confidence=1.0,
                method="exact",
            )

        # Phase 2 — TF-IDF cosine similarity.
        query_vec = self._vectorizer.transform([tx.description])
        sims = cosine_similarity(query_vec, self._train_matrix)[0]
        k = min(settings.ml_top_k, len(sims))
        top_idx = sorted(range(len(sims)), key=lambda i: float(sims[i]), reverse=True)[:k]
        top_scores = [float(sims[i]) for i in top_idx]
        top_categories = [self._train_labels[i] for i in top_idx]

        max_score = top_scores[0]
        if max_score <= 0.0:
            return None

        category_id = top_categories[0]  # top-1 argmax wins
        if len(set(top_categories)) == 1:
            # All top-k agree → boost by 20%, capped at 1.0.
            confidence = min(sum(top_scores) / len(top_scores) * 1.2, 1.0)
        else:
            confidence = max_score

        name = self._category_name(db, category_id)
        if name is None:
            return None
        return SuggestionResult(
            transaction_id=tx.id,
            suggested_category_id=category_id,
            suggested_category_name=name,
            confidence=confidence,
            method="tfidf",
        )

    def _category_name(self, db: Session, category_id: int) -> str | None:
        category = db.get(Category, category_id)
        return category.name if category is not None else None


_suggester: MLSuggester | None = None
_suggester_lock = threading.Lock()


def get_suggester() -> MLSuggester:
    global _suggester
    if _suggester is None:
        with _suggester_lock:
            if _suggester is None:
                _suggester = MLSuggester()
    return _suggester
