import pytest
from fastapi.testclient import TestClient
from pytest_mock import MockerFixture
from sqlalchemy.orm import Session

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


@pytest.fixture(autouse=True)
def _fresh_suggester(mocker: MockerFixture) -> None:
    # Isolate each test from the process-wide singleton's cached state.
    mocker.patch("app.routers.suggestions.get_suggester", return_value=MLSuggester())


def test_results_returned_with_training_data(client: TestClient) -> None:
    bank = BankFactory.create()
    groceries = CategoryFactory.create(name="Groceries")
    transport = CategoryFactory.create(name="Transport")
    for desc in ("walmart grocery store", "target grocery market", "aldi grocery run"):
        tx = TransactionFactory.create(bank=bank, type="expense", description=desc)
        MappingFactory.create(transaction=tx, category=groceries)
    for desc in ("uber ride downtown", "lyft taxi airport"):
        tx = TransactionFactory.create(bank=bank, type="expense", description=desc)
        MappingFactory.create(transaction=tx, category=transport)

    query = TransactionFactory.create(
        bank=bank, type="expense", description="walmart grocery purchase"
    )
    response = client.post("/api/suggestions", json={"transaction_ids": [query.id]})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["transaction_id"] == query.id
    assert results[0]["suggested_category_id"] == groceries.id
    assert results[0]["method"] in ("exact", "tfidf")


def test_income_transaction_rejected(client: TestClient) -> None:
    tx = TransactionFactory.create(type="income")
    response = client.post("/api/suggestions", json={"transaction_ids": [tx.id]})
    assert response.status_code == 400


def test_duplicate_ids_deduped(client: TestClient) -> None:
    bank = BankFactory.create()
    groceries = CategoryFactory.create(name="Groceries")
    for desc in (
        "walmart grocery store",
        "target grocery market",
        "aldi grocery run",
        "costco grocery haul",
        "kroger grocery trip",
    ):
        tx = TransactionFactory.create(bank=bank, type="expense", description=desc)
        MappingFactory.create(transaction=tx, category=groceries)

    query = TransactionFactory.create(
        bank=bank, type="expense", description="walmart grocery purchase"
    )
    response = client.post("/api/suggestions", json={"transaction_ids": [query.id, query.id]})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["transaction_id"] == query.id


def test_missing_transaction(client: TestClient) -> None:
    response = client.post("/api/suggestions", json={"transaction_ids": [9999]})
    assert response.status_code == 404
