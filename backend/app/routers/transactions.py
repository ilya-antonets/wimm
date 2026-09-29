from datetime import date
from math import ceil
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.exceptions import NotFoundError, ValidationError
from app.models import Mapping, Transaction
from app.schemas.transactions import TransactionPage, TransactionRead
from app.services.ml_suggester import get_suggester

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _parse_ids(ids: str) -> list[int]:
    parsed: list[int] = []
    for part in ids.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            parsed.append(int(part))
        except ValueError as e:
            raise ValidationError(f"Invalid transaction id '{part}' in ids") from e
    return parsed


@router.get("", response_model=TransactionPage)
def list_transactions(
    db: Session = Depends(get_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    type: Literal["income", "expense"] | None = Query(None),
    bank_id: int | None = Query(None),
    category_id: int | None = Query(None),
    unmapped: bool = Query(False),
    search: str | None = Query(None),
    ids: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> TransactionPage:
    stmt: Select[tuple[Transaction]] = select(Transaction).options(
        joinedload(Transaction.bank),
        joinedload(Transaction.mapping).joinedload(Mapping.category),
    )

    # Only treat ids as a bulk-fetch filter when it parses to a non-empty list;
    # an empty/whitespace-only `ids` param falls through to the normal filters.
    id_filter = _parse_ids(ids) if ids is not None else None
    if id_filter:
        stmt = stmt.where(Transaction.id.in_(id_filter))
    else:
        if date_from is not None:
            stmt = stmt.where(Transaction.date >= date_from)
        if date_to is not None:
            stmt = stmt.where(Transaction.date <= date_to)
        if type is not None:
            stmt = stmt.where(Transaction.type == type)
        if bank_id is not None:
            stmt = stmt.where(Transaction.bank_id == bank_id)
        if category_id is not None:
            stmt = stmt.where(Transaction.mapping.has(Mapping.category_id == category_id))
        if unmapped:
            stmt = stmt.where(~Transaction.mapping.has(), Transaction.type == "expense")
        if search is not None:
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(Transaction.description.ilike(f"%{escaped}%", escape="\\"))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    stmt = stmt.order_by(Transaction.date.desc(), Transaction.id.desc())
    if id_filter:
        # Bulk fetch returns the complete requested set, unpaginated.
        pages = 1
    else:
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        pages = ceil(total / page_size)
    items = list(db.scalars(stmt).unique())

    return TransactionPage(
        items=[TransactionRead.model_validate(tx) for tx in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)) -> Response:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise NotFoundError(f"Transaction {transaction_id} not found")
    db.delete(tx)
    db.commit()
    # Deleting a transaction cascade-deletes its mapping, shrinking the ML
    # training corpus — invalidate so the next suggestion call re-fits.
    get_suggester().invalidate()
    return Response(status_code=204)
