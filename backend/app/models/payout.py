import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utc_now


class Payout(Base):
    """What Concept Stay owes a host for one paid booking (paid out manually by the admin)."""

    __tablename__ = "payouts"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_payouts_booking_id"),
        Index("ix_payouts_host_id", "host_id"),
        Index("ix_payouts_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )
    host_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    gross_amount: Mapped[int] = mapped_column(Integer, nullable=False)  # what the guest paid
    commission: Mapped[int] = mapped_column(Integer, nullable=False)  # Concept Stay commission on the stay value
    fees: Mapped[int] = mapped_column(Integer, nullable=False)  # guest-side service fee kept by the platform
    taxes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # collected for remittance
    host_amount: Mapped[int] = mapped_column(Integer, nullable=False)  # what the host receives
    status: Mapped[str] = mapped_column(String(20), default="owed", nullable=False)  # owed | paid | voided
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    booking = relationship("Booking")
    host = relationship("User")
