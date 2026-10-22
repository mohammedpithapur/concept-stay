import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, utc_now

EXPERIENCE_CATEGORIES = ("adventure", "food", "culture", "wellness", "nature", "local_transport", "other")
EXPERIENCE_DIFFICULTIES = ("easy", "moderate", "hard")
EXPERIENCE_APPROVAL_STATUSES = ("draft", "pending_review", "approved", "rejected")
MAX_PARTY_SIZE = 20
MAX_EXPERIENCE_IMAGES = 10


class Experience(Base):
    """Something an operator offers (a trek, a food walk, a transfer). Bookable through its dated slots."""

    __tablename__ = "experiences"
    __table_args__ = (
        CheckConstraint("price_per_person > 0", name="ck_experiences_price_positive"),
        Index("ix_experiences_operator_id", "operator_id"),
        Index("ix_experiences_city", "city"),
        Index("ix_experiences_category", "category"),
        Index("ix_experiences_published", "is_published", "approval_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    operator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    meeting_point: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(10), nullable=False, default="easy")
    min_age: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    languages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    included: Mapped[str] = mapped_column(Text, nullable=False, default="")
    what_to_bring: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price_per_person: Mapped[int] = mapped_column(Integer, nullable=False)  # whole rupees
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending_review")
    pending_changes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(nullable=False, default=False)
    avg_rating: Mapped[Decimal] = mapped_column(Numeric(3, 1), nullable=False, default=0)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class ExperienceSlot(Base):
    """One dated departure of an experience. Seats are taken when a payment confirms, never before."""

    __tablename__ = "experience_slots"
    __table_args__ = (
        CheckConstraint("capacity >= 1", name="ck_experience_slots_capacity"),
        CheckConstraint("seats_booked >= 0 AND seats_booked <= capacity", name="ck_experience_slots_seats"),
        Index("ix_experience_slots_experience_start", "experience_id", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experience_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("experiences.id", ondelete="CASCADE"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    seats_booked: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ExperienceBooking(Base):
    __tablename__ = "experience_bookings"
    __table_args__ = (
        CheckConstraint("party_size >= 1", name="ck_experience_bookings_party"),
        UniqueConstraint("voucher_code", name="uq_experience_bookings_voucher"),
        Index("ix_experience_bookings_guest_id", "guest_id"),
        Index("ix_experience_bookings_slot_id", "slot_id"),
        Index("ix_experience_bookings_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experience_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("experiences.id"), nullable=False)
    slot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("experience_slots.id"), nullable=False)
    guest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_person: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[int] = mapped_column(Integer, nullable=False)  # price x party, before fee and tax
    service_fee: Mapped[int] = mapped_column(Integer, nullable=False)
    taxes: Mapped[int] = mapped_column(Integer, nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_percent: Mapped[int] = mapped_column(Integer, nullable=False)  # snapshot at booking time
    commission: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False, default=Decimal(1))
    charged_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    voucher_code: Mapped[str] = mapped_column(String(12), nullable=False)
    # pending | confirmed | completed | failed_full | expired | refunded
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class ExperiencePayment(Base):
    """Razorpay order for one experience booking (separate from stays: Payment.booking_id points at bookings)."""

    __tablename__ = "experience_payments"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_experience_payments_booking_id"),
        UniqueConstraint("razorpay_order_id", name="uq_experience_payments_order_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("experience_bookings.id", ondelete="CASCADE"), nullable=False
    )
    razorpay_order_id: Mapped[str] = mapped_column(String(100), nullable=False)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # minor units of `currency`
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")  # created|paid|failed|refunded
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class ExperiencePayout(Base):
    """What Concept Stay owes an operator for one paid experience booking (paid out manually by the admin)."""

    __tablename__ = "experience_payouts"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_experience_payouts_booking_id"),
        Index("ix_experience_payouts_operator_id", "operator_id"),
        Index("ix_experience_payouts_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("experience_bookings.id", ondelete="CASCADE"), nullable=False
    )
    operator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    gross_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    commission: Mapped[int] = mapped_column(Integer, nullable=False)
    fees: Mapped[int] = mapped_column(Integer, nullable=False)  # guest-side service fee kept by the platform
    taxes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # collected for remittance
    operator_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="owed")  # owed | paid | voided
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class ExperienceReview(Base):
    __tablename__ = "experience_reviews"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_experience_reviews_booking_id"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_experience_reviews_rating"),
        Index("ix_experience_reviews_experience_id", "experience_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("experience_bookings.id", ondelete="CASCADE"), nullable=False
    )
    guest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    experience_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("experiences.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
