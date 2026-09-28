import hashlib
from datetime import datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any

import pandas as pd
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.exceptions import ValidationError
from app.models import Bank, ImportBatch, Transaction
from app.schemas.imports import FailedRow, ImportResult


def import_csv(
    db: Session,
    bank: Bank,
    file_content: bytes,
    filename: str,
) -> ImportResult:
    # 1. Decode bytes
    try:
        text = file_content.decode(bank.encoding)
    except (UnicodeDecodeError, LookupError) as e:
        raise ValidationError(f"Cannot decode file with encoding '{bank.encoding}': {e}") from e

    # 2. Parse CSV with pandas
    try:
        df = pd.read_csv(
            StringIO(text),
            skiprows=bank.skip_header_rows,
            skipfooter=bank.skip_footer_rows,
            engine="python",
            dtype=str,
            keep_default_na=False,
        )
    except Exception as e:
        raise ValidationError(f"Failed to parse CSV: {e}") from e

    columns: list[str] = [str(c) for c in df.columns]
    column_map: dict[str, Any] = dict(bank.column_map)

    # 3. Resolve column refs to actual column names
    try:
        date_col = _normalize_column_ref(column_map["date"], columns)
        amount_col = _normalize_column_ref(column_map["amount"], columns)
        desc_col = _normalize_column_ref(column_map["description"], columns)
    except (ValueError, KeyError) as e:
        raise ValidationError(f"Column mapping error: {e}") from e

    tx_id_col: str | None = None
    raw_tx_id_ref = column_map.get("transaction_id")
    if raw_tx_id_ref is not None:
        try:
            tx_id_col = _normalize_column_ref(raw_tx_id_ref, columns)
        except (ValueError, KeyError) as e:
            raise ValidationError(f"Column mapping error for transaction_id: {e}") from e

    # 4. Verify required columns exist in DataFrame
    missing = [col for col in [date_col, amount_col, desc_col] if col not in df.columns]
    if missing:
        raise ValidationError(f"Columns not found in CSV: {missing}")
    if tx_id_col is not None and tx_id_col not in df.columns:
        raise ValidationError(f"transaction_id column '{tx_id_col}' not found in CSV")

    # 5. Per-row parsing
    valid_rows: list[dict[str, Any]] = []
    failed_rows: list[FailedRow] = []

    for row_idx, (_, row) in enumerate(df.iterrows(), start=1):
        raw_data = ",".join(str(v) for v in row.to_list())

        date_str = str(row[date_col]).strip()
        try:
            date_val = datetime.strptime(date_str, bank.date_format).date()
        except ValueError as e:
            failed_rows.append(
                FailedRow(row_number=row_idx, raw_data=raw_data, error=f"Date parse error: {e}")
            )
            continue

        amount_str = str(row[amount_col]).strip()
        try:
            amount = Decimal(amount_str)
        except InvalidOperation as e:
            failed_rows.append(
                FailedRow(
                    row_number=row_idx, raw_data=raw_data, error=f"Amount parse error: {e}"
                )
            )
            continue

        tx_type = "income" if amount >= 0 else "expense"
        description = str(row[desc_col]).strip()

        if tx_id_col is not None and str(row[tx_id_col]).strip():
            dedup_key = f"{bank.id}:{str(row[tx_id_col]).strip()}"
        else:
            dedup_key = _compute_dedup_key(bank.id, str(date_val), amount, description)

        valid_rows.append(
            {
                "bank_id": bank.id,
                "date": date_val,
                "amount": amount,
                "description": description,
                "type": tx_type,
                "dedup_key": dedup_key,
            }
        )

    # 6. Fail-fast if nothing is parseable
    if not valid_rows:
        raise ValidationError("No parseable rows found in CSV")

    # 7. Create ImportBatch; flush to get id
    import_batch = ImportBatch(bank_id=bank.id, filename=filename)
    db.add(import_batch)
    db.flush()

    for tx_row in valid_rows:
        tx_row["import_batch_id"] = import_batch.id

    # 8. Bulk INSERT OR IGNORE (single multi-values statement for correct rowcount)
    stmt = insert(Transaction).prefix_with("OR IGNORE").values(valid_rows)
    cursor = db.execute(stmt)
    new_count: int = cursor.rowcount

    # 9. Commit
    db.commit()

    return ImportResult(
        import_batch_id=import_batch.id,
        total_rows_parsed=len(valid_rows) + len(failed_rows),
        new_transactions=new_count,
        duplicate_transactions=len(valid_rows) - new_count,
        failed_rows=failed_rows,
    )


def _compute_dedup_key(bank_id: int, date: str, amount: Decimal, description: str) -> str:
    normalized = amount.quantize(Decimal("0.01"))
    payload = f"{bank_id}|{date}|{normalized}|{description}".encode()
    return hashlib.sha256(payload).hexdigest()


def _normalize_column_ref(ref: str | int, columns: list[str]) -> str:
    if isinstance(ref, int):
        if ref < 0 or ref >= len(columns):
            raise ValueError(f"Column index {ref} out of range (CSV has {len(columns)} columns)")
        return columns[ref]
    return ref
