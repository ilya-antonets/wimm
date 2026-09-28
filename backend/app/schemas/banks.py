from pydantic import BaseModel, ConfigDict, Field


class ColumnMap(BaseModel):
    date: str | int
    amount: str | int
    description: str | int
    transaction_id: str | int | None = None


class BankCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    column_map: ColumnMap
    date_format: str = Field(..., min_length=1, max_length=40)
    skip_header_rows: int = Field(0, ge=0)
    skip_footer_rows: int = Field(0, ge=0)
    encoding: str = Field("utf-8", min_length=1, max_length=30)


class BankUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    column_map: ColumnMap | None = None
    date_format: str | None = None
    skip_header_rows: int | None = Field(None, ge=0)
    skip_footer_rows: int | None = Field(None, ge=0)
    encoding: str | None = None


class BankRead(BankCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)
