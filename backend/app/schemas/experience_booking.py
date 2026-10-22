import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.experience import MAX_PARTY_SIZE


class ExperienceBookingIn(BaseModel):
    slot_id: uuid.UUID
    party_size: int = Field(ge=1, le=MAX_PARTY_SIZE)
    currency: str = "INR"


class ExperienceVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class ExperienceVoucherOut(BaseModel):
    """A guest's booking. The voucher code, meeting point and operator contact appear only once it is confirmed."""

    id: uuid.UUID
    experience_id: uuid.UUID
    slot_id: uuid.UUID
    experience_title: str
    starts_at: datetime
    party_size: int
    price_per_person: int
    value: int
    service_fee: int
    taxes: int
    total: int
    currency: str
    charged_minor: int
    status: str
    created_at: datetime
    voucher_code: str | None = None
    meeting_point: str | None = None
    operator_name: str | None = None
    operator_phone: str | None = None
    operator_email: str | None = None


class ExperienceCheckoutOut(BaseModel):
    booking: ExperienceVoucherOut
    razorpay_order_id: str
    amount: int
    currency: str
    key_id: str
