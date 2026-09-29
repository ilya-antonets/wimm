from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Mapping, Transaction
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


def test_list_empty(client: TestClient) -> None:
    response = client.get("/api/transactions")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["page_size"] == 50
    assert data["pages"] == 0


def test_filter_by_type(client: TestClient) -> None:
    bank = BankFactory.create()
    TransactionFactory.create(bank=bank, type="income")
    TransactionFactory.create(bank=bank, type="expense")
    TransactionFactory.create(bank=bank, type="expense")

    response = client.get("/api/transactions", params={"type": "income"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["type"] == "income"

    response = client.get("/api/transactions", params={"type": "expense"})
    assert response.json()["total"] == 2


def test_filter_by_date_range(client: TestClient) -> None:
    bank = BankFactory.create()
    TransactionFactory.create(bank=bank, date=date(2025, 1, 1))
    TransactionFactory.create(bank=bank, date=date(2025, 1, 15))
    TransactionFactory.create(bank=bank, date=date(2025, 2, 1))

    response = client.get(
        "/api/transactions",
        params={"date_from": "2025-01-10", "date_to": "2025-01-31"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["date"] == "2025-01-15"


def test_filter_by_bank_id(client: TestClient) -> None:
    bank_a = BankFactory.create()
    bank_b = BankFactory.create()
    TransactionFactory.create(bank=bank_a)
    TransactionFactory.create(bank=bank_a)
    TransactionFactory.create(bank=bank_b)

    response = client.get("/api/transactions", params={"bank_id": bank_a.id})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert all(item["bank_id"] == bank_a.id for item in data["items"])


def test_filter_by_category_id(client: TestClient) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create()
    tx = TransactionFactory.create(bank=bank, type="expense")
    MappingFactory.create(transaction=tx, category=cat)
    TransactionFactory.create(bank=bank, type="expense")

    response = client.get("/api/transactions", params={"category_id": cat.id})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == tx.id
    assert data["items"][0]["mapping"]["category_id"] == cat.id


def test_unmapped_filter(client: TestClient) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create()
    mapped = TransactionFactory.create(bank=bank, type="expense")
    MappingFactory.create(transaction=mapped, category=cat)
    unmapped_expense = TransactionFactory.create(bank=bank, type="expense")
    TransactionFactory.create(bank=bank, type="income")

    response = client.get("/api/transactions", params={"unmapped": "true"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == unmapped_expense.id


def test_search_substring(client: TestClient) -> None:
    bank = BankFactory.create()
    TransactionFactory.create(bank=bank, description="NETFLIX subscription")
    TransactionFactory.create(bank=bank, description="Grocery store")

    response = client.get("/api/transactions", params={"search": "netflix"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert "NETFLIX" in data["items"][0]["description"]


def test_ids_bulk_fetch(client: TestClient) -> None:
    bank = BankFactory.create()
    tx1 = TransactionFactory.create(bank=bank, type="expense")
    tx2 = TransactionFactory.create(bank=bank, type="income")
    TransactionFactory.create(bank=bank)

    # Other filters (type=income here) must be ignored when ids is present.
    response = client.get(
        "/api/transactions",
        params={"ids": f"{tx1.id},{tx2.id}", "type": "income"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert {item["id"] for item in data["items"]} == {tx1.id, tx2.id}


def test_ids_invalid_returns_400(client: TestClient) -> None:
    response = client.get("/api/transactions", params={"ids": "1,abc"})
    assert response.status_code == 400


def test_pagination_slice(client: TestClient) -> None:
    bank = BankFactory.create()
    for i in range(1, 8):
        TransactionFactory.create(bank=bank, date=date(2025, 1, i))

    response = client.get("/api/transactions", params={"page": 2, "page_size": 3})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 7
    assert data["page"] == 2
    assert data["page_size"] == 3
    assert data["pages"] == 3
    assert len(data["items"]) == 3


def test_page_size_upper_bound_422(client: TestClient) -> None:
    response = client.get("/api/transactions", params={"page_size": 201})
    assert response.status_code == 422


def test_mapping_embedded(client: TestClient) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create(name="Streaming")
    tx = TransactionFactory.create(bank=bank, type="expense")
    MappingFactory.create(transaction=tx, category=cat)

    response = client.get("/api/transactions")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["mapping"] == {"category_id": cat.id, "category_name": "Streaming"}
    assert item["bank_name"] == bank.name


def test_delete_transaction(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    tx = TransactionFactory.create(bank=bank)
    response = client.delete(f"/api/transactions/{tx.id}")
    assert response.status_code == 204
    assert db.get(Transaction, tx.id) is None


def test_delete_cascades_mapping(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create()
    tx = TransactionFactory.create(bank=bank, type="expense")
    mapping = MappingFactory.create(transaction=tx, category=cat)
    mapping_id = mapping.id

    response = client.delete(f"/api/transactions/{tx.id}")
    assert response.status_code == 204
    assert db.get(Transaction, tx.id) is None
    assert db.get(Mapping, mapping_id) is None


def test_delete_not_found(client: TestClient) -> None:
    response = client.delete("/api/transactions/9999")
    assert response.status_code == 404
