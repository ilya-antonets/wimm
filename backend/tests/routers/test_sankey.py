from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pytest_mock import MockerFixture
from sqlalchemy.orm import Session

from app.services.ml_suggester import MLSuggester
from tests.factories import BankFactory, CategoryFactory, MappingFactory, TransactionFactory


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db
    CategoryFactory._meta.sqlalchemy_session = db
    TransactionFactory._meta.sqlalchemy_session = db
    MappingFactory._meta.sqlalchemy_session = db


@pytest.fixture(autouse=True)
def _fresh_suggester(mocker: MockerFixture) -> None:
    # Isolate each test from the process-wide singleton's cached state.
    mocker.patch("app.routers.sankey.get_suggester", return_value=MLSuggester())


def test_valid_period(client: TestClient) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create(name="Groceries")
    TransactionFactory.create(bank=bank, type="income", amount=Decimal("1000.00"))
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-400.00"))
    MappingFactory.create(transaction=tx, category=cat)

    response = client.get("/api/sankey?date_from=2025-01-01&date_to=2025-12-31")

    assert response.status_code == 200
    body = response.json()
    assert body["period_income"] == 1000.0
    assert body["period_expenses"] == 400.0
    assert body["balance"] == 600.0
    node_ids = {n["id"] for n in body["nodes"]}
    assert "__expenses__" in node_ids
    assert "__proficit__" in node_ids
    assert f"cat_{cat.id}" in node_ids


def test_missing_start_param(client: TestClient) -> None:
    response = client.get("/api/sankey?date_to=2025-12-31")
    assert response.status_code == 422


def test_start_after_end(client: TestClient) -> None:
    response = client.get("/api/sankey?date_from=2025-12-31&date_to=2025-01-01")
    assert response.status_code == 400


def test_empty_period(client: TestClient) -> None:
    response = client.get("/api/sankey?date_from=2025-01-01&date_to=2025-12-31")
    assert response.status_code == 200
    body = response.json()
    assert body["nodes"] == []
    assert body["links"] == []
    assert body["balance"] == 0.0
