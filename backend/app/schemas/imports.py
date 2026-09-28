from pydantic import BaseModel


class FailedRow(BaseModel):
    row_number: int
    raw_data: str
    error: str


class ImportResult(BaseModel):
    import_batch_id: int
    total_rows_parsed: int
    new_transactions: int
    duplicate_transactions: int
    failed_rows: list[FailedRow]
