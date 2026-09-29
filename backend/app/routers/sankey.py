from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import ValidationError
from app.schemas.sankey import SankeyPayload
from app.services.ml_suggester import get_suggester
from app.services.sankey_service import build_sankey

router = APIRouter(prefix="/api/sankey", tags=["sankey"])


@router.get("", response_model=SankeyPayload)
def get_sankey(
    db: Session = Depends(get_db),
    date_from: date = Query(...),
    date_to: date = Query(...),
) -> SankeyPayload:
    if date_from > date_to:
        raise ValidationError("date_from must not be after date_to")
    return build_sankey(db, date_from, date_to, get_suggester())
