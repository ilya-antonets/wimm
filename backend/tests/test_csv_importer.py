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


def test_encoding_error_raises_validation_error(db: Session) -> None:
    bank = BankFactory.create(encoding="ascii")
    # Latin-1 byte sequence that is invalid ASCII
    csv = "date,amount,description\n2024-01-15,-50.00,Caf\xe9".encode("latin-1")
    with pytest.raises(ValidationError, match="Cannot decode"):
        import_csv(db, bank, csv, "test.csv")


def test_column_index_out_of_range(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 99, "description": 2}
    db.commit()
    csv = b"date,amount,description\n2024-01-15,-50.00,Coffee"
    with pytest.raises(ValidationError, match="Column mapping error"):
        import_csv(db, bank, csv, "test.csv")


def test_amount_parse_error_partial_success(db: Session) -> None:
    bank = BankFactory.create()
    csv = (
        b"date,amount,description\n"
        b"2024-01-15,-50.00,Coffee\n"
        b"2024-01-16,NOT_A_NUMBER,Grocery\n"
        b"2024-01-17,2000.00,Salary"
    )
    result = import_csv(db, bank, csv, "test.csv")
    assert result.total_rows_parsed == 3
    assert result.new_transactions == 2
    assert len(result.failed_rows) == 1
    assert result.failed_rows[0].row_number == 2
    assert "Amount parse error" in result.failed_rows[0].error


def test_empty_transaction_id_fails_row(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "transaction_id": 3}
    db.commit()
    csv = b"date,amount,description,tx_id\n2024-01-15,-50.00,Coffee,TX001\n2024-01-16,-30.00,Tea,"
    result = import_csv(db, bank, csv, "test.csv")
    assert result.new_transactions == 1
    assert len(result.failed_rows) == 1
    assert "Empty transaction_id" in result.failed_rows[0].error


def test_transaction_id_column_not_in_csv(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {
        "date": "date",
        "amount": "amount",
        "description": "desc",
        "transaction_id": "tx_id",
    }
    db.commit()
    # CSV has no tx_id column
    csv = b"date,amount,desc\n2024-01-15,-50.00,Coffee"
    with pytest.raises(ValidationError, match="transaction_id column"):
        import_csv(db, bank, csv, "test.csv")


def test_memo_fills_empty_description(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "memo": 3}
    db.commit()
    csv = (
        b"date,amount,description,memo\n"
        b"2024-01-15,-50.00,,ATM withdrawal\n"
        b"2024-01-16,-30.00,Coffee,Latte memo"
    )
    result = import_csv(db, bank, csv, "test.csv")
    assert result.new_transactions == 2
    txs = list(db.scalars(select(Transaction).order_by(Transaction.id)))
    # Empty description falls back to the memo value.
    assert txs[0].description == "ATM withdrawal"
    # Non-empty description is kept; memo is ignored.
    assert txs[1].description == "Coffee"


def test_reimport_backfills_empty_description_from_memo(db: Session) -> None:
    bank = BankFactory.create()
    # First import without a memo mapping: empty description is stored as "".
    bank.column_map = {"date": 0, "amount": 1, "description": 2}
    db.commit()
    csv_no_memo = b"date,amount,description,memo\n2024-01-15,-50.00,,ATM withdrawal"
    first = import_csv(db, bank, csv_no_memo, "first.csv")
    assert first.new_transactions == 1
    tx = db.scalars(select(Transaction)).one()
    assert tx.description == ""

    # Reimport with memo mapped: the raw (empty) description keeps the dedup key stable,
    # so the existing row is updated rather than inserted anew.
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "memo": 3}
    db.commit()
    second = import_csv(db, bank, csv_no_memo, "second.csv")
    assert second.new_transactions == 0
    assert second.updated_transactions == 1
    assert second.duplicate_transactions == 0
    txs = list(db.scalars(select(Transaction)))
    assert len(txs) == 1
    assert txs[0].description == "ATM withdrawal"


def test_reimport_backfills_description_transaction_id_dedup(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "transaction_id": 3}
    db.commit()
    csv_no_memo = b"date,amount,description,tx_id\n2024-01-15,-50.00,,TX001"
    first = import_csv(db, bank, csv_no_memo, "first.csv")
    assert first.new_transactions == 1
    assert db.scalars(select(Transaction)).one().description == ""

    bank.column_map = {
        "date": 0,
        "amount": 1,
        "description": 2,
        "transaction_id": 3,
        "memo": 4,
    }
    db.commit()
    csv_memo = b"date,amount,description,tx_id,memo\n2024-01-15,-50.00,,TX001,Wire transfer"
    second = import_csv(db, bank, csv_memo, "second.csv")
    assert second.new_transactions == 0
    assert second.updated_transactions == 1
    txs = list(db.scalars(select(Transaction)))
    assert len(txs) == 1
    assert txs[0].description == "Wire transfer"


def test_reimport_memo_backfill_is_idempotent(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "memo": 3}
    db.commit()
    csv = b"date,amount,description,memo\n2024-01-15,-50.00,,ATM withdrawal"
    import_csv(db, bank, csv, "first.csv")
    result = import_csv(db, bank, csv, "second.csv")
    assert result.new_transactions == 0
    assert result.updated_transactions == 0
    assert result.duplicate_transactions == 1


def test_reimport_does_not_overwrite_non_empty_description(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "transaction_id": 3}
    db.commit()
    csv_first = b"date,amount,description,tx_id\n2024-01-15,-50.00,Coffee,TX001"
    import_csv(db, bank, csv_first, "first.csv")

    bank.column_map = {
        "date": 0,
        "amount": 1,
        "description": 2,
        "transaction_id": 3,
        "memo": 4,
    }
    db.commit()
    # Description is still non-empty; a memo must not clobber it.
    csv_second = b"date,amount,description,tx_id,memo\n2024-01-15,-50.00,Coffee,TX001,Some memo"
    result = import_csv(db, bank, csv_second, "second.csv")
    assert result.updated_transactions == 0
    assert db.scalars(select(Transaction)).one().description == "Coffee"


def test_memo_column_absent_from_csv_is_tolerated(db: Session) -> None:
    bank = BankFactory.create()
    bank.column_map = {"date": 0, "amount": 1, "description": 2, "memo": "memo"}
    db.commit()
    # File lacks the mapped memo column; import should still succeed.
    csv = b"date,amount,description\n2024-01-15,-50.00,Coffee"
    result = import_csv(db, bank, csv, "test.csv")
    assert result.new_transactions == 1
    assert db.scalars(select(Transaction)).one().description == "Coffee"
