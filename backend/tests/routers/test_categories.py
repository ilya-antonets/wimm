import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, Mapping
from tests.factories import BankFactory, CategoryFactory, MappingFactory, TransactionFactory


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db
    CategoryFactory._meta.sqlalchemy_session = db
    TransactionFactory._meta.sqlalchemy_session = db
    MappingFactory._meta.sqlalchemy_session = db


def test_get_tree(client: TestClient) -> None:
    response = client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(c["id"] == 1 and c["name"] == "Uncategorized" for c in data)


def test_create_category(client: TestClient) -> None:
    response = client.post(
        "/api/categories", json={"name": "Food", "parent_id": None, "sort_order": 0}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Food"
    assert "id" in data

    list_response = client.get("/api/categories")
    ids = [c["id"] for c in list_response.json()]
    assert data["id"] in ids


def test_rename_category(client: TestClient, db: Session) -> None:
    cat = CategoryFactory.create(name="Old Name")
    response = client.put(f"/api/categories/{cat.id}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    db.expire(cat)
    assert cat.name == "New Name"


def test_rename_uncategorized_rejected(client: TestClient) -> None:
    response = client.put("/api/categories/1", json={"name": "Renamed"})
    assert response.status_code == 403


def test_delete_category_reassigns(client: TestClient, db: Session) -> None:
    cat = CategoryFactory.create()
    bank = BankFactory.create()
    tx = TransactionFactory.create(bank=bank, type="expense")
    mapping = MappingFactory.create(transaction=tx, category=cat)

    response = client.delete(f"/api/categories/{cat.id}")
    assert response.status_code == 204

    assert db.get(Category, cat.id) is None
    reloaded = db.get(Mapping, mapping.id)
    assert reloaded is not None
    assert reloaded.category_id == 1


def test_delete_uncategorized_rejected(client: TestClient) -> None:
    response = client.delete("/api/categories/1")
    assert response.status_code == 403


def test_move_category(client: TestClient, db: Session) -> None:
    parent = CategoryFactory.create(parent_id=None)
    child = CategoryFactory.create(parent_id=None)

    response = client.patch(
        f"/api/categories/{child.id}/move",
        json={"new_parent_id": parent.id, "sort_order": 0},
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] == parent.id


def test_move_creates_cycle_rejected(client: TestClient) -> None:
    parent = CategoryFactory.create(parent_id=None)
    child = CategoryFactory.create(parent_id=parent.id)

    response = client.patch(
        f"/api/categories/{parent.id}/move",
        json={"new_parent_id": child.id, "sort_order": 0},
    )
    assert response.status_code == 400
