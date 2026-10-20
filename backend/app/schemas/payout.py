from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PayoutOut(BaseModel):
    id: UUID
    booking_id: UUID
    host_id: UUID
    gross_amount: int
    commission: int
    fees: int
    taxes: int
    host_amount: int
    status: str
    paid_at: datetime | None = None
    reference: str | None = None
    created_at: datetime
    host_kyc_status: str | None = None  # incomplete | submitted | verified | rejected | exempt (admin-owned)

    model_config = {"from_attributes": True}


class PayoutMarkPaidIn(BaseModel):
    reference: str = Field(min_length=1, max_length=255)
