from typing import Literal

from pydantic import BaseModel, Field


class SuggestionRequest(BaseModel):
    transaction_ids: list[int] = Field(..., min_length=1, max_length=200)


class SuggestionResult(BaseModel):
    transaction_id: int
    suggested_category_id: int
    suggested_category_name: str
    confidence: float
    method: Literal["exact", "tfidf"]
