from __future__ import annotations

import uuid
import secrets
import string
from datetime import datetime, date

from sqlalchemy import String, Integer, Text, Date, DateTime, Enum as SAEnum, ForeignKey, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, utc_now
import enum


def _generate_booking_ref() -> str:
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(secrets.choice(chars) for _ in range(6))
    return f'ES-{suffix}'


class BookingStatus(str, enum.Enum):
    pending   = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"


class PaymentStatus(str, enum.Enum):
    unpaid   = "unpaid"
    paid     = "paid"
    refunded = "refunded"


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_property_id", "property_id"),
        Index("ix_bookings_guest_id", "guest_id"),
        Index("ix_bookings_status", "status"),
        Index("ix_bookings_property_dates", "property_id", "check_in", "check_out"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False)
    guest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    pets: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nights: Mapped[int] = mapped_column(Integer, nullable=False)
    base_price: Mapped[int] = mapped_column(Integer, nullable=False)
    cleaning_fee: Mapped[int] = mapped_column(Integer, nullable=False)
    pet_charge: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    extra_guest_charge: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    taxes: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    service_fee: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(SAEnum(BookingStatus), default=BookingStatus.pending, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus), default=PaymentStatus.unpaid, nullable=False)
    is_shadow_block: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin_block: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # optional admin reason for the block
    parent_booking_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=True)
    booking_ref: Mapped[str] = mapped_column(String(20), default=_generate_booking_ref, nullable=False, index=True)
    guest_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_email: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    property: Mapped["Property"] = relationship("Property")
    guest: Mapped["User"] = relationship("User")
    parent_booking: Mapped[Booking | None] = relationship(
        "Booking",
        remote_side="Booking.id",
        back_populates="shadow_blocks",
    )
    shadow_blocks: Mapped[list["Booking"]] = relationship("Booking", back_populates="parent_booking", cascade="all, delete-orphan")
    payment: Mapped["Payment | None"] = relationship("Payment", back_populates="booking", uselist=False, cascade="all, delete-orphan")  # type: ignore[name-defined]
