from pydantic import BaseModel, ConfigDict


class MappingCreate(BaseModel):
    transaction_id: int
    category_id: int


class MappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    transaction_id: int
    category_id: int
