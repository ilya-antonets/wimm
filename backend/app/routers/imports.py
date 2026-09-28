from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import ValidationError
from app.models import Bank
from app.schemas.imports import ImportResult
from app.services.csv_importer import import_csv
from app.services.ml_suggester import get_suggester

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("", response_model=ImportResult, status_code=201)
async def upload_csv(
    response: Response,
    bank_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ImportResult:
    bank = db.get(Bank, bank_id)
    if bank is None:
        raise ValidationError(f"Bank {bank_id} not found")

    filename = file.filename or "upload.csv"
    if not filename.lower().endswith(".csv"):
        raise ValidationError("File must have .csv extension")

    content = await file.read()
    result = import_csv(db, bank, content, filename)
    db.commit()

    get_suggester().invalidate()

    if result.new_transactions == 0:
        response.status_code = 200

    return result
