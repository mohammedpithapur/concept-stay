from datetime import datetime

from pydantic import BaseModel, Field


class ExperienceReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)


class ExperienceReviewOut(BaseModel):
    """Public view of a review: the guest's first name only."""

    rating: int
    text: str
    guest_first_name: str
    created_at: datetime
