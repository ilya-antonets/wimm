import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.factories import BankFactory, TransactionFactory


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db
    TransactionFactory._meta.sqlalchemy_session = db


VALID_BANK_BODY = {
    "name": "My Bank",
    "column_map": {"date": "Date", "amount": "Amount", "description": "Description"},
    "date_format": "%Y-%m-%d",
    "skip_header_rows": 0,
    "skip_footer_rows": 0,
    "encoding": "utf-8",
}


def test_list_banks_empty(client: TestClient) -> None:
    response = client.get("/api/banks")
    assert response.status_code == 200
    assert response.json() == []


def test_create_bank(client: TestClient, db: Session) -> None:
    response = client.post("/api/banks", json=VALID_BANK_BODY)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Bank"
    assert "id" in data
    from app.models import Bank

    assert db.get(Bank, data["id"]) is not None


def test_create_bank_missing_column_map(client: TestClient) -> None:
    body = {k: v for k, v in VALID_BANK_BODY.items() if k != "column_map"}
    response = client.post("/api/banks", json=body)
    assert response.status_code == 422


def test_get_bank_by_id(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    response = client.get(f"/api/banks/{bank.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == bank.id
    assert data["name"] == bank.name
    assert "column_map" in data
    assert "date_format" in data


def test_get_bank_not_found(client: TestClient) -> None:
    response = client.get("/api/banks/9999")
    assert response.status_code == 404


def test_update_bank(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    response = client.put(f"/api/banks/{bank.id}", json={"name": "Renamed Bank"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed Bank"
    db.expire(bank)
    assert bank.name == "Renamed Bank"


def test_delete_bank_with_transactions(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    TransactionFactory.create(bank=bank)
    response = client.delete(f"/api/banks/{bank.id}")
    assert response.status_code == 409


def test_delete_empty_bank(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    response = client.delete(f"/api/banks/{bank.id}")
    assert response.status_code == 204
    from app.models import Bank

    assert db.get(Bank, bank.id) is None
