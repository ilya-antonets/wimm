from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserPreference
from app.schemas.preferences import PreferencesRead, PreferencesWrite

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


def _get_or_create(db: Session) -> UserPreference:
    row = db.get(UserPreference, 1)
    if row is None:
        row = UserPreference(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("", response_model=PreferencesRead)
def get_preferences(db: Session = Depends(get_db)) -> UserPreference:
    return _get_or_create(db)


@router.put("", response_model=PreferencesRead)
def update_preferences(body: PreferencesWrite, db: Session = Depends(get_db)) -> UserPreference:
    row = _get_or_create(db)
    row.ml_min_confidence = body.ml_min_confidence
    db.commit()
    db.refresh(row)
    return row
