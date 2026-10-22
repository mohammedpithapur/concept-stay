import uuid
from datetime import datetime

from pydantic import BaseModel


class ExperiencePayoutOut(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    operator_id: uuid.UUID
    gross_amount: int
    commission: int
    fees: int
    taxes: int
    operator_amount: int
    status: str
    paid_at: datetime | None = None
    reference: str | None = None
    created_at: datetime
    operator_kyc_status: str | None = None  # incomplete | submitted | verified | rejected | exempt (admin-owned)

    model_config = {"from_attributes": True}


class OperatorBookingOut(BaseModel):
    """What an operator may know about a guest: first name and phone, nothing else."""

    id: uuid.UUID
    experience_title: str
    starts_at: datetime
    party_size: int
    voucher_code: str
    guest_first_name: str
    guest_phone: str | None
    status: str


class ExperienceRefundOut(BaseModel):
    booking_id: uuid.UUID
    status: str
    payout_needs_recovery: bool
