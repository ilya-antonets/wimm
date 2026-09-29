from pydantic import BaseModel


class SankeyNode(BaseModel):
    id: str
    name: str
    depth: int | None = None
    # Expense category nodes only: IDs of expense transactions assigned to this
    # category in the requested period. Used by the drill-down panel so the
    # frontend can fetch those transactions without a separate API call. Income
    # nodes and the EXPENSES/PROFICIT/DEFICIT separator nodes leave this None.
    transaction_ids: list[int] | None = None


class SankeyLink(BaseModel):
    source: str
    target: str
    value: float  # absolute value, always positive


class SankeyPayload(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]
    period_income: float
    period_expenses: float
    balance: float  # positive = proficit, negative = deficit
