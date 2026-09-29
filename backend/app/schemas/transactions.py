from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class MappingInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: int
    category_name: str


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bank_id: int
    bank_name: str
    import_batch_id: int | None
    date: date
    amount: Decimal
    description: str
    type: Literal["income", "expense"]
    mapping: MappingInfo | None


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
    page: int
    page_size: int
    pages: int
