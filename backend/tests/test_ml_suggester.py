import pytest
from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.services.ml_suggester import MLSuggester
from tests.factories import (
    BankFactory,
    CategoryFactory,
    MappingFactory,
    TransactionFactory,
)


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db
    CategoryFactory._meta.sqlalchemy_session = db
    TransactionFactory._meta.sqlalchemy_session = db
    MappingFactory._meta.sqlalchemy_session = db


def _seed_mapping(db: Session, description: str, category: Category) -> None:
    tx = TransactionFactory.create(type="expense", description=description)
    MappingFactory.create(transaction=tx, category=category)


def _unmapped(db: Session, description: str) -> Transaction:
    tx: Transaction = TransactionFactory.create(type="expense", description=description)
    return tx


def test_exact_match_confidence_one(db: Session) -> None:
    category = CategoryFactory.create(name="Coffee")
    for desc in (
        "starbucks coffee downtown",
        "grocery market weekly",
        "gas station fuel",
        "pharmacy prescription",
        "hardware store tools",
    ):
        _seed_mapping(db, desc, category)

    query = _unmapped(db, "STARBUCKS COFFEE DOWNTOWN")
    results = MLSuggester().suggest(db, [query.id])

    assert len(results) == 1
    assert results[0].method == "exact"
    assert results[0].confidence == 1.0
    assert results[0].suggested_category_id == category.id


def test_tfidf_nearest_neighbor(db: Session) -> None:
    groceries = CategoryFactory.create(name="Groceries")
    transport = CategoryFactory.create(name="Transport")
    for desc in ("walmart grocery store", "target grocery market", "aldi grocery run"):
        _seed_mapping(db, desc, groceries)
    for desc in ("uber ride downtown", "lyft taxi airport"):
        _seed_mapping(db, desc, transport)

    query = _unmapped(db, "walmart grocery purchase today")
    results = MLSuggester().suggest(db, [query.id])

    assert len(results) == 1
    assert results[0].method == "tfidf"
    assert results[0].suggested_category_id == groceries.id
    assert 0.0 < results[0].confidence <= 1.0


def test_empty_corpus_returns_nothing(db: Session) -> None:
    # Below ml_min_training_samples (default 5) — no model is built.
    category = CategoryFactory.create()
    _seed_mapping(db, "lonely merchant", category)

    query = _unmapped(db, "lonely merchant")
    assert MLSuggester().suggest(db, [query.id]) == []


def test_cache_invalidated_after_invalidate(db: Session) -> None:
    original = CategoryFactory.create(name="Original")
    for desc in (
        "alpha merchant one",
        "beta merchant two",
        "gamma merchant three",
        "delta merchant four",
        "epsilon merchant five",
    ):
        _seed_mapping(db, desc, original)

    suggester = MLSuggester()
    query = _unmapped(db, "COFFEE SHOP CORNER")
    first = suggester.suggest(db, [query.id])
    # No exact match yet for this description.
    assert all(r.method != "exact" for r in first)

    # Add an exact training example for the query, then invalidate.
    reassigned = CategoryFactory.create(name="Reassigned")
    _seed_mapping(db, "COFFEE SHOP CORNER", reassigned)
    suggester.invalidate()

    second = suggester.suggest(db, [query.id])
    assert len(second) == 1
    assert second[0].method == "exact"
    assert second[0].confidence == 1.0
    assert second[0].suggested_category_id == reassigned.id


def test_top_k_agreement_boost(db: Session) -> None:
    subscription = CategoryFactory.create(name="Subscription")
    other = CategoryFactory.create(name="Other")
    # Three near-identical docs of one category dominate the top-k.
    for _ in range(3):
        _seed_mapping(db, "netflix subscription monthly", subscription)
    for desc in ("gasoline fuel station", "parking garage fee"):
        _seed_mapping(db, desc, other)

    # Reordered tokens → not an exact match, but the top-k all agree.
    query = _unmapped(db, "monthly netflix subscription")
    results = MLSuggester().suggest(db, [query.id])

    assert len(results) == 1
    assert results[0].method == "tfidf"
    assert results[0].suggested_category_id == subscription.id
    # Agreement boost yields a high confidence.
    assert results[0].confidence > 0.5


def test_below_min_confidence_still_returned(db: Session) -> None:
    matched = CategoryFactory.create(name="Matched")
    for desc in (
        "very long detailed merchant description alpha bravo charlie",
        "another lengthy unrelated payee delta echo foxtrot",
        "third distinct vendor golf hotel india juliet",
        "fourth separate seller kilo lima mike november",
        "fifth different store oscar papa quebec romeo",
    ):
        _seed_mapping(db, desc, matched)

    # Shares only one low-signal token with a single training doc → weak match.
    query = _unmapped(db, "alpha")
    results = MLSuggester().suggest(db, [query.id])

    assert len(results) == 1
    assert results[0].method == "tfidf"
    assert 0.0 < results[0].confidence < 0.3  # below ml_min_confidence, still returned
