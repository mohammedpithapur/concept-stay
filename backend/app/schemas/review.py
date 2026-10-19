from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime, date


class ReviewCreate(BaseModel):
    property_id: UUID
    guest_name: str
    rating: int  # 1-5
    comment: str | None = None
    platform: str | None = None
    created_at: datetime | None = None


class ReviewOut(BaseModel):
    id: UUID
    property_id: UUID
    guest_id: UUID | None = None
    booking_id: UUID | None = None
    guest_name: str
    platform: str | None = None
    rating: int
    comment: str | None
    cleanliness: int | None = None
    location: int | None = None
    comfort: int | None = None
    hospitality: int | None = None
    accuracy: int | None = None
    would_recommend: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

class VerifiedReviewIn(BaseModel):
    """Guest review of a finished stay: five category scores (1-5) plus a recommendation."""
    cleanliness: int = Field(ge=1, le=5)
    location: int = Field(ge=1, le=5)
    comfort: int = Field(ge=1, le=5)
    hospitality: int = Field(ge=1, le=5)
    accuracy: int = Field(ge=1, le=5)
    would_recommend: bool
    comment: str | None = Field(default=None, max_length=4000)
