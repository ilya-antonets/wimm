from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session


def test_health_returns_200(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_db_fixture_seeds_uncategorized(db: Session) -> None:
    count = db.execute(text("SELECT COUNT(*) FROM categories WHERE id=1")).scalar()
    assert count == 1
