from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import Category, Mapping, Transaction
from app.schemas.mappings import MappingCreate, MappingRead
from app.services.ml_suggester import get_suggester

router = APIRouter(prefix="/api/mappings", tags=["mappings"])


@router.post("", response_model=MappingRead)
def create_or_update_mapping(
    body: MappingCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> Mapping:
    tx = db.get(Transaction, body.transaction_id)
    if tx is None:
        raise NotFoundError(f"Transaction {body.transaction_id} not found")
    if db.get(Category, body.category_id) is None:
        raise NotFoundError(f"Category {body.category_id} not found")
    if tx.type == "income":
        raise ValidationError("Cannot map an income transaction to a category")

    existing = db.scalars(
        select(Mapping).where(Mapping.transaction_id == body.transaction_id)
    ).first()
    if existing is not None:
        existing.category_id = body.category_id
        db.commit()
        db.refresh(existing)
        get_suggester().invalidate()
        response.status_code = 200
        return existing

    mapping = Mapping(transaction_id=body.transaction_id, category_id=body.category_id)
    db.add(mapping)
    try:
        db.commit()
    except IntegrityError as e:
        # Concurrent insert raced us; the UNIQUE constraint is the safety net.
        db.rollback()
        raced = db.scalars(
            select(Mapping).where(Mapping.transaction_id == body.transaction_id)
        ).first()
        if raced is None:
            raise ConflictError("Mapping could not be created") from e
        raced.category_id = body.category_id
        db.commit()
        db.refresh(raced)
        get_suggester().invalidate()
        response.status_code = 200
        return raced

    db.refresh(mapping)
    get_suggester().invalidate()
    response.status_code = 201
    return mapping


@router.delete("/{transaction_id}", status_code=204)
def delete_mapping(transaction_id: int, db: Session = Depends(get_db)) -> Response:
    mapping = db.scalars(select(Mapping).where(Mapping.transaction_id == transaction_id)).first()
    if mapping is None:
        raise NotFoundError(f"No mapping for transaction {transaction_id}")
    db.delete(mapping)
    db.commit()
    get_suggester().invalidate()
    return Response(status_code=204)
