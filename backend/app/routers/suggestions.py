from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import NotFoundError, ValidationError
from app.models import Transaction
from app.schemas.suggestions import SuggestionRequest, SuggestionResult
from app.services.ml_suggester import get_suggester

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])


@router.post("", response_model=list[SuggestionResult])
def suggest_categories(
    body: SuggestionRequest,
    db: Session = Depends(get_db),
) -> list[SuggestionResult]:
    transactions = db.scalars(
        select(Transaction).where(Transaction.id.in_(body.transaction_ids))
    ).all()
    found = {tx.id: tx for tx in transactions}

    missing = [tx_id for tx_id in body.transaction_ids if tx_id not in found]
    if missing:
        raise NotFoundError(f"Transactions not found: {missing}")

    income = [tx_id for tx_id, tx in found.items() if tx.type == "income"]
    if income:
        raise ValidationError(f"Cannot suggest categories for income transactions: {income}")

    return get_suggester().suggest(db, body.transaction_ids, found)
