"""Slot availability rules and booking creation for experiences."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.experience import Experience, ExperienceBooking, ExperiencePayment, ExperienceSlot
from app.models.user import OperatorStatus, User
from app.services.app_settings import get_commission_percent
from app.services.experience_pricing import compute_experience_pricing
from app.services.fx import UnsupportedCurrency, get_rate, to_minor

BOOKING_CUTOFF = timedelta(hours=1)  # booking closes this long before a slot starts
VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alike characters


def seats_left(slot: ExperienceSlot) -> int:
    return max(0, slot.capacity - slot.seats_booked)


def slot_is_open(slot: ExperienceSlot, now: datetime | None = None) -> bool:
    """Time rule only: the slot starts more than BOOKING_CUTOFF from now. Compared in UTC; India time is display-only."""
    now = now or datetime.now(timezone.utc)
    return slot.starts_at - now > BOOKING_CUTOFF


def slot_is_bookable(slot: ExperienceSlot, now: datetime | None = None) -> bool:
    return slot_is_open(slot, now) and seats_left(slot) > 0


def public_clauses():
    """Conditions for an experience anyone may see and book."""
    return (
        Experience.approval_status == "approved",
        Experience.is_published.is_(True),
        User.operator_status == OperatorStatus.approved,
    )


async def visible_experience(db: AsyncSession, experience_id: uuid.UUID) -> Experience:
    row = (
        await db.execute(
            select(Experience)
            .join(User, User.id == Experience.operator_id)
            .where(Experience.id == experience_id, *public_clauses())
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Experience not found")
    return row


async def _unique_voucher(db: AsyncSession) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(VOUCHER_ALPHABET) for _ in range(10))
        if not await db.scalar(select(ExperienceBooking.id).where(ExperienceBooking.voucher_code == code)):
            return code
    raise HTTPException(status_code=503, detail="Could not allocate a voucher code, please retry")


async def create_experience_booking(
    db: AsyncSession, user: User, slot_id: uuid.UUID, party_size: int, currency: str = "INR"
) -> tuple[ExperienceBooking, ExperiencePayment]:
    """Create a pending booking and its Razorpay order. Holds no seats: seats are taken when payment confirms."""
    from app.routers import payments as payments_router  # lazy: that router imports the payment services

    slot = await db.get(ExperienceSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    exp = await visible_experience(db, slot.experience_id)
    if not slot_is_open(slot):
        raise HTTPException(status_code=422, detail="Booking for this slot has closed")
    if party_size > seats_left(slot):
        raise HTTPException(status_code=409, detail=f"Only {seats_left(slot)} seats left")
    currency = currency.upper()
    try:
        rate = await get_rate(db, currency)
    except UnsupportedCurrency as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")

    commission_percent = await get_commission_percent(db)
    pricing = compute_experience_pricing(exp.price_per_person, party_size, commission_percent)
    charged_minor = to_minor(pricing["total"], rate)
    booking = ExperienceBooking(
        experience_id=exp.id, slot_id=slot.id, guest_id=user.id, party_size=party_size,
        price_per_person=exp.price_per_person, value=pricing["value"], service_fee=pricing["service_fee"],
        taxes=pricing["taxes"], total=pricing["total"], commission_percent=commission_percent,
        commission=pricing["commission"], currency=currency, fx_rate=rate, charged_minor=charged_minor,
        voucher_code=await _unique_voucher(db), status="pending",
    )
    db.add(booking)
    await db.flush()
    try:
        order = payments_router._get_razorpay_client().order.create(
            {
                "amount": charged_minor,
                "currency": currency,
                "receipt": booking.voucher_code,
                "payment_capture": 1,
                "notes": {"experience": exp.title, "slot": slot.starts_at.isoformat(), "party_size": str(party_size)},
            }
        )
    except Exception as exc:  # the SDK raises assorted error types; nothing has been committed yet
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}")
    payment = ExperiencePayment(
        booking_id=booking.id, razorpay_order_id=order["id"], amount=charged_minor, currency=currency, status="created"
    )
    db.add(payment)
    await db.commit()
    await db.refresh(booking)
    await db.refresh(payment)
    return booking, payment
