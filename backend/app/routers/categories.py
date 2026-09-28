from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category
from app.schemas.categories import (
    CategoryCreate,
    CategoryMoveRequest,
    CategoryRead,
    CategoryUpdate,
)
from app.services import category_service as svc
from app.services.ml_suggester import get_suggester

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)) -> list[Category]:
    return svc.get_all_categories(db)


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(body: CategoryCreate, db: Session = Depends(get_db)) -> Category:
    return svc.create_category(db, body.name, body.parent_id, body.sort_order)


@router.put("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, body: CategoryUpdate, db: Session = Depends(get_db)
) -> Category:
    return svc.rename_category(db, category_id, body.name, body.sort_order)


@router.patch("/{category_id}/move", response_model=CategoryRead)
def move_category(
    category_id: int, body: CategoryMoveRequest, db: Session = Depends(get_db)
) -> Category:
    return svc.move_category(db, category_id, body.new_parent_id, body.sort_order)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)) -> Response:
    svc.delete_category(db, category_id, get_suggester())
    return Response(status_code=204)
