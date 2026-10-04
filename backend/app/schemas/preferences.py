from pydantic import BaseModel, Field


class PreferencesRead(BaseModel):
    ml_min_confidence: float

    model_config = {"from_attributes": True}


class PreferencesWrite(BaseModel):
    ml_min_confidence: float = Field(..., ge=0.0, le=1.0)
