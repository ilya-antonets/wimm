from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    parent_id: int | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    sort_order: int | None = None
    # parent_id intentionally absent — reparenting uses PATCH /move


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: int | None
    sort_order: int


class CategoryMoveRequest(BaseModel):
    new_parent_id: int | None = None  # None = promote to root
    sort_order: int = 0
