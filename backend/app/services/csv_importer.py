import hashlib
from datetime import datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any

import pandas as pd
from sqlalchemy import insert, select, update
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

    memo_col: str | None = None
    raw_memo_ref = column_map.get("memo")
    if raw_memo_ref is not None:
        try:
            memo_col = _normalize_column_ref(raw_memo_ref, columns)
        except (ValueError, KeyError) as e:
            raise ValidationError(f"Column mapping error for memo: {e}") from e

    # 4. Verify required columns exist in DataFrame
    missing = [col for col in [date_col, amount_col, desc_col] if col not in df.columns]
    if missing:
        raise ValidationError(f"Columns not found in CSV: {missing}")
    if tx_id_col is not None and tx_id_col not in df.columns:
        raise ValidationError(f"transaction_id column '{tx_id_col}' not found in CSV")
    # Memo is an optional enrichment: tolerate files that lack the mapped memo column.
    if memo_col is not None and memo_col not in df.columns:
        memo_col = None

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
                FailedRow(row_number=row_idx, raw_data=raw_data, error=f"Amount parse error: {e}")
            )
            continue

        tx_type = "income" if amount > 0 else "expense"
        raw_description = str(row[desc_col]).strip()
        description = raw_description
        if not description and memo_col is not None:
            memo_val = str(row[memo_col]).strip()
            if memo_val:
                description = memo_val

        if tx_id_col is not None:
            tx_id_val = str(row[tx_id_col]).strip()
            if not tx_id_val:
                failed_rows.append(
                    FailedRow(row_number=row_idx, raw_data=raw_data, error="Empty transaction_id")
                )
                continue
            dedup_key = f"{bank.id}:{tx_id_val}"
        else:
            dedup_key = _compute_dedup_key(bank.id, str(date_val), amount, raw_description)

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
        summary = "; ".join(f"row {r.row_number}: {r.error}" for r in failed_rows[:5])
        raise ValidationError(f"No parseable rows found in CSV. {summary}")

    # 7. Pre-filter known duplicates with a portable SELECT
    existing = (
        db.execute(
            select(Transaction.dedup_key, Transaction.description).where(
                Transaction.dedup_key.in_([r["dedup_key"] for r in valid_rows])
            )
        )
        .tuples()
        .all()
    )
    existing_desc: dict[str, str] = dict(existing)

    new_rows = [r for r in valid_rows if r["dedup_key"] not in existing_desc]
    # Back-fill previously-empty descriptions from memo; never overwrite a non-empty one.
    update_rows = [
        r
        for r in valid_rows
        if r["dedup_key"] in existing_desc
        and existing_desc[r["dedup_key"]] == ""
        and r["description"] != ""
    ]
    duplicate_count = len(valid_rows) - len(new_rows) - len(update_rows)

    # 8. Apply description back-fills to existing rows
    for r in update_rows:
        db.execute(
            update(Transaction)
            .where(Transaction.dedup_key == r["dedup_key"])
            .values(description=r["description"])
        )

    # 9. Return early when there are no new rows (updates, if any, are already applied)
    if not new_rows:
        return ImportResult(
            import_batch_id=None,
            total_rows_parsed=len(valid_rows) + len(failed_rows),
            new_transactions=0,
            updated_transactions=len(update_rows),
            duplicate_transactions=duplicate_count,
            failed_rows=failed_rows,
        )

    # 10. Create ImportBatch; flush to get id
    import_batch = ImportBatch(bank_id=bank.id, filename=filename)
    db.add(import_batch)
    db.flush()

    for tx_row in new_rows:
        tx_row["import_batch_id"] = import_batch.id

    # 11. Bulk INSERT (plain — no dialect-specific conflict clause needed)
    db.execute(insert(Transaction).values(new_rows))

    return ImportResult(
        import_batch_id=import_batch.id,
        total_rows_parsed=len(valid_rows) + len(failed_rows),
        new_transactions=len(new_rows),
        updated_transactions=len(update_rows),
        duplicate_transactions=duplicate_count,
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
