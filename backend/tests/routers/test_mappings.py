import pytest
from fastapi.testclient import TestClient
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Mapping
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


def test_create_mapping(client: TestClient, db: Session) -> None:
    tx = TransactionFactory.create(type="expense")
    category = CategoryFactory.create()
    response = client.post(
        "/api/mappings",
        json={"transaction_id": tx.id, "category_id": category.id},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["transaction_id"] == tx.id
    assert body["category_id"] == category.id
    row = db.scalars(select(Mapping).where(Mapping.transaction_id == tx.id)).one()
    assert row.category_id == category.id


def test_reassign_mapping(client: TestClient, db: Session) -> None:
    tx = TransactionFactory.create(type="expense")
    first = CategoryFactory.create()
    second = CategoryFactory.create()
    MappingFactory.create(transaction=tx, category=first)

    response = client.post(
        "/api/mappings",
        json={"transaction_id": tx.id, "category_id": second.id},
    )
    assert response.status_code == 200
    assert response.json()["category_id"] == second.id


def test_reassign_leaves_no_duplicate_row(client: TestClient, db: Session) -> None:
    tx = TransactionFactory.create(type="expense")
    first = CategoryFactory.create()
    second = CategoryFactory.create()
    MappingFactory.create(transaction=tx, category=first)

    client.post("/api/mappings", json={"transaction_id": tx.id, "category_id": second.id})

    rows = db.scalars(select(Mapping).where(Mapping.transaction_id == tx.id)).all()
    assert len(rows) == 1


def test_income_transaction_rejected(client: TestClient) -> None:
    tx = TransactionFactory.create(type="income")
    category = CategoryFactory.create()
    response = client.post(
        "/api/mappings",
        json={"transaction_id": tx.id, "category_id": category.id},
    )
    assert response.status_code == 400


def test_missing_transaction(client: TestClient) -> None:
    category = CategoryFactory.create()
    response = client.post(
        "/api/mappings",
        json={"transaction_id": 9999, "category_id": category.id},
    )
    assert response.status_code == 404


def test_missing_category(client: TestClient) -> None:
    tx = TransactionFactory.create(type="expense")
    response = client.post(
        "/api/mappings",
        json={"transaction_id": tx.id, "category_id": 9999},
    )
    assert response.status_code == 404


def test_delete_mapping(client: TestClient, db: Session) -> None:
    tx = TransactionFactory.create(type="expense")
    category = CategoryFactory.create()
    mapping = MappingFactory.create(transaction=tx, category=category)
    mapping_id = mapping.id

    response = client.delete(f"/api/mappings/{tx.id}")
    assert response.status_code == 204
    assert db.get(Mapping, mapping_id) is None


def test_delete_missing_mapping(client: TestClient) -> None:
    tx = TransactionFactory.create(type="expense")
    response = client.delete(f"/api/mappings/{tx.id}")
    assert response.status_code == 404


def test_create_conflict_when_integrity_error_unrecoverable(
    client: TestClient, db: Session, mocker: MockerFixture
) -> None:
    # Simulate a concurrent-insert race where the UNIQUE constraint fires but
    # no surviving row can be recovered afterwards → 409.
    tx = TransactionFactory.create(type="expense")
    category = CategoryFactory.create()
    mocker.patch.object(db, "commit", side_effect=IntegrityError("insert", {}, Exception("unique")))

    response = client.post(
        "/api/mappings",
        json={"transaction_id": tx.id, "category_id": category.id},
    )
    assert response.status_code == 409


def test_create_invalidates_ml_cache(client: TestClient, mocker: MockerFixture) -> None:
    tx = TransactionFactory.create(type="expense")
    category = CategoryFactory.create()
    mock_suggester = mocker.MagicMock()
    mocker.patch("app.routers.mappings.get_suggester", return_value=mock_suggester)

    response = client.post(
        "/api/mappings",
        json={"transaction_id": tx.id, "category_id": category.id},
    )
    assert response.status_code == 201
    mock_suggester.invalidate.assert_called_once()


def test_delete_invalidates_ml_cache(client: TestClient, mocker: MockerFixture) -> None:
    tx = TransactionFactory.create(type="expense")
    category = CategoryFactory.create()
    MappingFactory.create(transaction=tx, category=category)
    mock_suggester = mocker.MagicMock()
    mocker.patch("app.routers.mappings.get_suggester", return_value=mock_suggester)

    response = client.delete(f"/api/mappings/{tx.id}")
    assert response.status_code == 204
    mock_suggester.invalidate.assert_called_once()
