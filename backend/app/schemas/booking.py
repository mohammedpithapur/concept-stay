from pydantic import BaseModel, model_validator, field_validator, Field
from uuid import UUID
from datetime import datetime, date
from typing import Literal

from app.config import settings


class BookingCreate(BaseModel):
    property_id: UUID
    check_in: date
    check_out: date
    guests: int
    pets: int = 0
    guest_name: str | None = None
    guest_email: str | None = None
    guest_phone: str | None = None
    note: str | None = None
    currency: str = "INR"

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v):
        v = (v or "INR").upper()
        if v not in settings.SUPPORTED_CURRENCIES:
            raise ValueError(f"currency must be one of {settings.SUPPORTED_CURRENCIES}")
        return v

    @model_validator(mode="after")
    def validate_booking(self):
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        if self.guests < 1:
            raise ValueError("at least 1 guest required")
        if self.pets < 0:
            raise ValueError("pets cannot be negative")
        return self


class BookingOut(BaseModel):
    id: UUID
    property_id: UUID
    guest_id: UUID
    check_in: date
    check_out: date
    guests: int
    pets: int
    nights: int
    base_price: int
    cleaning_fee: int
    pet_charge: int
    extra_guest_charge: int = 0
    taxes: int = 0
    refund_amount: int = 0
    service_fee: int = 0
    guest_id_status: str = "missing"
    currency: str = "INR"
    charged_minor: int = 0
    total: int
    status: str
    payment_status: str
    is_shadow_block: bool
    is_admin_block: bool
    note: str | None
    booking_ref: str
    guest_name: str
    guest_email: str
    guest_phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BookingStatusUpdate(BaseModel):
    status: str  # confirmed | completed | cancelled


class BookingListOut(BaseModel):
    items: list[BookingOut]
    total: int
    page: int
    limit: int


# ── Admin Calendar / Date Blocking ──────────────────────────────────────────

class AdminBlockCreate(BaseModel):
    check_in: date
    check_out: date
    note: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        return self


class CalendarEventOut(BaseModel):
    id: UUID
    type: Literal["guest_booking", "admin_block", "shadow_block"]
    check_in: date
    check_out: date
    # Guest booking fields
    guest_name: str | None = None
    guest_email: str | None = None
    booking_ref: str | None = None
    total: int | None = None
    status: str | None = None
    payment_status: str | None = None
    # Admin block fields
    note: str | None = None
    # Shadow block fields
    parent_booking_ref: str | None = None

    model_config = {"from_attributes": True}


from app.schemas.price_override import PriceOverrideOut


class CalendarOut(BaseModel):
    events: list[CalendarEventOut]
    price_overrides: list[PriceOverrideOut] = Field(default_factory=list)