import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import ValidationError
from app.models import Transaction
from app.services.csv_importer import import_csv
from tests.factories import BankFactory


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db


def test_basic_import(db: Session) -> None:
    bank = BankFactory.create()
    csv = (
        b"date,amount,description\n"
        b"2024-01-15,-50.00,Coffee\n"
        b"2024-01-16,-120.00,Grocery\n"
        b"2024-01-17,2000.00,Salary"
    )
    result = import_csv(db, bank, csv, "test.csv")
    assert result.total_rows_parsed == 3
    assert result.new_transactions == 3
    assert result.duplicate_transactions == 0
    assert result.failed_rows == []
    assert result.import_batch_id > 0


def test_dedup_by_hash(db: Session) -> None:
    bank = BankFactory.create()
    csv = b"date,amount,description\n2024-01-15,-50.00,Coffee\n2024-01-16,-120.00,Grocery"
    import_csv(db, bank, csv, "first.csv")
    result2 = import_csv(db, bank, csv, "second.csv")
    assert result2.new_transactions == 0
    assert result2.duplicate_transactions == 2


def test_dedup_by_external_id(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "transaction_id": 3}
    db.commit()
    csv = (
        b"date,amount,description,tx_id\n"
        b"2024-01-15,-50.00,Coffee,TX001\n"
        b"2024-01-16,-120.00,Grocery,TX002"
    )
    import_csv(db, bank, csv, "first.csv")
    result2 = import_csv(db, bank, csv, "second.csv")
    assert result2.new_transactions == 0
    assert result2.duplicate_transactions == 2


def test_skip_header_rows(db: Session) -> None:
    bank = BankFactory.create(skip_header_rows=1)
    csv = b"extra header row\ndate,amount,description\n2024-01-15,-50.00,Coffee"
    result = import_csv(db, bank, csv, "test.csv")
    assert result.total_rows_parsed == 1
    assert result.new_transactions == 1


def test_income_expense_sign_detection(db: Session) -> None:
    bank = BankFactory.create()
    csv = b"date,amount,description\n2024-01-15,2000.00,Salary\n2024-01-16,-50.00,Coffee"
    result = import_csv(db, bank, csv, "test.csv")
    assert result.new_transactions == 2
    transactions = list(db.scalars(select(Transaction).order_by(Transaction.id)))
    assert transactions[0].type == "income"
    assert transactions[1].type == "expense"


def test_latin1_encoding(db: Session) -> None:
    bank = BankFactory.create(encoding="latin-1")
    csv_text = "date,amount,description\n2024-01-15,-50.00,Caf\xe9"
    csv = csv_text.encode("latin-1")
    result = import_csv(db, bank, csv, "test.csv")
    assert result.new_transactions == 1
    tx = db.scalars(select(Transaction)).first()
    assert tx is not None
    assert "Caf" in tx.description


def test_invalid_date_format(db: Session) -> None:
    bank = BankFactory.create()
    csv = (
        b"date,amount,description\n"
        b"2024-01-15,-50.00,Coffee\n"
        b"NOT_A_DATE,-120.00,Grocery\n"
        b"2024-01-17,2000.00,Salary"
    )
    result = import_csv(db, bank, csv, "test.csv")
    assert result.total_rows_parsed == 3
    assert result.new_transactions == 2
    assert len(result.failed_rows) == 1
    assert result.failed_rows[0].row_number == 2


def test_missing_required_column(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": "date", "amount": "amount", "description": "description"}
    db.commit()
    # CSV is missing the 'amount' column
    csv = b"date,description\n2024-01-15,Coffee"
    with pytest.raises(ValidationError):
        import_csv(db, bank, csv, "test.csv")


def test_all_rows_failed(db: Session) -> None:
    bank = BankFactory.create()
    csv = b"date,amount,description\nBAD_DATE,not_a_number,Coffee"
    with pytest.raises(ValidationError) as exc_info:
        import_csv(db, bank, csv, "test.csv")
    assert "No parseable rows" in str(exc_info.value)
