import pytest
from fastapi.testclient import TestClient
from pytest_mock import MockerFixture
from sqlalchemy.orm import Session

from tests.factories import BankFactory

_SIMPLE_CSV = b"date,amount,description\n2024-01-15,-50.00,Coffee"


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db


def test_valid_upload_returns_201(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    response = client.post(
        "/api/import",
        data={"bank_id": str(bank.id)},
        files={"file": ("test.csv", _SIMPLE_CSV, "text/csv")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["new_transactions"] == 1
    assert data["import_batch_id"] > 0
    assert data["duplicate_transactions"] == 0


def test_duplicate_upload_returns_200(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    client.post(
        "/api/import",
        data={"bank_id": str(bank.id)},
        files={"file": ("first.csv", _SIMPLE_CSV, "text/csv")},
    )
    response = client.post(
        "/api/import",
        data={"bank_id": str(bank.id)},
        files={"file": ("second.csv", _SIMPLE_CSV, "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["new_transactions"] == 0
    assert response.json()["duplicate_transactions"] == 1


def test_wrong_bank_id_returns_400(client: TestClient) -> None:
    response = client.post(
        "/api/import",
        data={"bank_id": "9999"},
        files={"file": ("test.csv", _SIMPLE_CSV, "text/csv")},
    )
    assert response.status_code == 400


def test_malformed_csv_returns_400(client: TestClient, db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": "date", "amount": "amount", "description": "description"}
    db.commit()
    # CSV is missing the 'amount' column the bank expects
    csv = b"date,description\n2024-01-15,Coffee"
    response = client.post(
        "/api/import",
        data={"bank_id": str(bank.id)},
        files={"file": ("test.csv", csv, "text/csv")},
    )
    assert response.status_code == 400


def test_upload_triggers_ml_invalidation(
    client: TestClient, db: Session, mocker: MockerFixture
) -> None:
    bank = BankFactory.create()
    mock_suggester = mocker.MagicMock()
    mocker.patch("app.routers.imports.get_suggester", return_value=mock_suggester)
    response = client.post(
        "/api/import",
        data={"bank_id": str(bank.id)},
        files={"file": ("test.csv", _SIMPLE_CSV, "text/csv")},
    )
    assert response.status_code == 201
    mock_suggester.invalidate.assert_called_once()
