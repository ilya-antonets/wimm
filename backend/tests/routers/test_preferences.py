from fastapi.testclient import TestClient


def test_get_preferences_returns_defaults(client: TestClient) -> None:
    response = client.get("/api/preferences")
    assert response.status_code == 200
    body = response.json()
    assert "ml_min_confidence" in body
    assert body["ml_min_confidence"] == 0.3


def test_put_preferences_persists(client: TestClient) -> None:
    response = client.put("/api/preferences", json={"ml_min_confidence": 0.6})
    assert response.status_code == 200
    assert response.json()["ml_min_confidence"] == 0.6


def test_get_after_put_returns_updated_value(client: TestClient) -> None:
    client.put("/api/preferences", json={"ml_min_confidence": 0.75})
    response = client.get("/api/preferences")
    assert response.status_code == 200
    assert response.json()["ml_min_confidence"] == 0.75


def test_put_rejects_out_of_range(client: TestClient) -> None:
    response = client.put("/api/preferences", json={"ml_min_confidence": 1.5})
    assert response.status_code == 422

    response = client.put("/api/preferences", json={"ml_min_confidence": -0.1})
    assert response.status_code == 422
