from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import ConflictError, NotFoundError
from app.models import Bank
from app.schemas.banks import BankCreate, BankRead, BankUpdate

router = APIRouter(prefix="/api/banks", tags=["banks"])


def _get_bank_or_404(bank_id: int, db: Session) -> Bank:
    bank = db.get(Bank, bank_id)
    if bank is None:
        raise NotFoundError(f"Bank {bank_id} not found")
    return bank


@router.get("", response_model=list[BankRead])
def list_banks(db: Session = Depends(get_db)) -> list[Bank]:
    return list(db.scalars(select(Bank).order_by(Bank.id)))


@router.post("", response_model=BankRead, status_code=201)
def create_bank(body: BankCreate, db: Session = Depends(get_db)) -> Bank:
    bank = Bank(
        name=body.name,
        column_map=body.column_map.model_dump(),
        date_format=body.date_format,
        skip_header_rows=body.skip_header_rows,
        skip_footer_rows=body.skip_footer_rows,
        encoding=body.encoding,
    )
    db.add(bank)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ConflictError(f"Bank name '{body.name}' already exists") from e
    db.refresh(bank)
    return bank


@router.get("/{bank_id}", response_model=BankRead)
def get_bank(bank_id: int, db: Session = Depends(get_db)) -> Bank:
    return _get_bank_or_404(bank_id, db)


@router.put("/{bank_id}", response_model=BankRead)
def update_bank(bank_id: int, body: BankUpdate, db: Session = Depends(get_db)) -> Bank:
    bank = _get_bank_or_404(bank_id, db)
    if body.name is not None:
        bank.name = body.name
    if body.column_map is not None:
        bank.column_map = body.column_map.model_dump()
    if body.date_format is not None:
        bank.date_format = body.date_format
    if body.skip_header_rows is not None:
        bank.skip_header_rows = body.skip_header_rows
    if body.skip_footer_rows is not None:
        bank.skip_footer_rows = body.skip_footer_rows
    if body.encoding is not None:
        bank.encoding = body.encoding
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ConflictError(f"Bank name '{body.name}' already exists") from e
    db.refresh(bank)
    return bank


@router.delete("/{bank_id}", status_code=204)
def delete_bank(bank_id: int, db: Session = Depends(get_db)) -> Response:
    bank = _get_bank_or_404(bank_id, db)
    db.delete(bank)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("Bank has linked transactions or import batches; remove them first")
    return Response(status_code=204)
