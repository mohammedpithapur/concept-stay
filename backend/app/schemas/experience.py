import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.models.experience import (
    EXPERIENCE_CATEGORIES, EXPERIENCE_DIFFICULTIES, MAX_EXPERIENCE_IMAGES, MAX_PARTY_SIZE,
)


def _check_member(value: str | None, allowed: tuple[str, ...], label: str) -> str | None:
    if value is not None and value not in allowed:
        raise ValueError(f"{label} must be one of: {', '.join(allowed)}")
    return value


def _check_languages(value: list[str] | None) -> list[str] | None:
    if value is None:
        return value
    if len(value) > 10 or any(not isinstance(v, str) or not 1 <= len(v) <= 40 for v in value):
        raise ValueError("languages must be at most 10 names of 1-40 characters")
    return value


class ExperienceIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    images: list[str] = Field(default_factory=list, max_length=MAX_EXPERIENCE_IMAGES)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    meeting_point: str = Field(default="", max_length=2000)
    category: str
    duration_minutes: int = Field(gt=0, le=60 * 24 * 7)
    difficulty: str = "easy"
    min_age: int = Field(default=0, ge=0, le=99)
    languages: list[str] = Field(default_factory=list)
    included: str = Field(default="", max_length=5000)
    what_to_bring: str = Field(default="", max_length=5000)
    price_per_person: int = Field(gt=0, le=1_000_000)

    @field_validator("category")
    @classmethod
    def _category(cls, v):
        return _check_member(v, EXPERIENCE_CATEGORIES, "category")

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, v):
        return _check_member(v, EXPERIENCE_DIFFICULTIES, "difficulty")

    @field_validator("languages")
    @classmethod
    def _languages(cls, v):
        return _check_languages(v)


class ExperiencePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    images: list[str] | None = Field(default=None, max_length=MAX_EXPERIENCE_IMAGES)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    state: str | None = Field(default=None, min_length=1, max_length=100)
    meeting_point: str | None = Field(default=None, max_length=2000)
    category: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0, le=60 * 24 * 7)
    difficulty: str | None = None
    min_age: int | None = Field(default=None, ge=0, le=99)
    languages: list[str] | None = None
    included: str | None = Field(default=None, max_length=5000)
    what_to_bring: str | None = Field(default=None, max_length=5000)
    price_per_person: int | None = Field(default=None, gt=0, le=1_000_000)

    @field_validator("category")
    @classmethod
    def _category(cls, v):
        return _check_member(v, EXPERIENCE_CATEGORIES, "category")

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, v):
        return _check_member(v, EXPERIENCE_DIFFICULTIES, "difficulty")

    @field_validator("languages")
    @classmethod
    def _languages(cls, v):
        return _check_languages(v)


class ExperienceOut(BaseModel):
    """The operator's view of their own listing (includes review state)."""

    id: uuid.UUID
    operator_id: uuid.UUID
    title: str
    description: str
    images: list[str]
    city: str
    state: str
    meeting_point: str
    category: str
    duration_minutes: int
    difficulty: str
    min_age: int
    languages: list[str]
    included: str
    what_to_bring: str
    price_per_person: int
    approval_status: str
    pending_changes: dict | None
    rejection_reason: str | None
    is_published: bool
    avg_rating: float
    review_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RejectExperienceIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


# ── Slots ──

class SlotIn(BaseModel):
    starts_at: AwareDatetime
    capacity: int = Field(ge=1, le=500)


class SlotPatch(BaseModel):
    capacity: int = Field(ge=1, le=500)


class SlotOut(BaseModel):
    id: uuid.UUID
    experience_id: uuid.UUID
    starts_at: datetime
    capacity: int
    seats_booked: int
    seats_left: int


class SlotPublic(BaseModel):
    id: uuid.UUID
    starts_at: datetime
    capacity: int
    seats_left: int


# ── Public ──

class PublicExperienceOut(BaseModel):
    """What anyone may see. The meeting point and operator contact appear only on a confirmed booking."""

    id: uuid.UUID
    title: str
    description: str
    images: list[str]
    city: str
    state: str
    category: str
    duration_minutes: int
    difficulty: str
    min_age: int
    languages: list[str]
    included: str
    what_to_bring: str
    price_per_person: int
    avg_rating: float
    review_count: int
    next_slot_at: datetime | None = None

    model_config = {"from_attributes": True}


class PublicExperienceDetail(PublicExperienceOut):
    slots: list[SlotPublic]


class ExperienceListOut(BaseModel):
    items: list[PublicExperienceOut]
    total: int


class QuoteIn(BaseModel):
    slot_id: uuid.UUID
    party_size: int = Field(ge=1, le=MAX_PARTY_SIZE)
    currency: str = "INR"
