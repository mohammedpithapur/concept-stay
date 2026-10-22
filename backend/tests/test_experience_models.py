from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.experience import (
    Experience, ExperienceBooking, ExperiencePayment, ExperiencePayout, ExperienceReview, ExperienceSlot,
)
from app.models.user import User, UserRole

pytestmark = pytest.mark.asyncio


async def _user(db, email, role=UserRole.guest):
    user = User(email=email, password_hash="x", full_name=email.split("@")[0], role=role)
    db.add(user)
    await db.flush()
    return user


async def _seed(db, capacity=4, seats_booked=0):
    operator = await _user(db, "op@example.com", UserRole.operator)
    guest = await _user(db, "guest@example.com")
    exp = Experience(
        operator_id=operator.id, title="Sunrise trek", description="d", city="Munnar", state="Kerala",
        meeting_point="Gate 1", category="adventure", duration_minutes=180, difficulty="easy", min_age=8,
        price_per_person=2500,
    )
    db.add(exp)
    await db.flush()
    slot = ExperienceSlot(
        experience_id=exp.id, starts_at=datetime.now(timezone.utc) + timedelta(days=3),
        capacity=capacity, seats_booked=seats_booked,
    )
    db.add(slot)
    await db.flush()
    return operator, guest, exp, slot


def _booking(exp, slot, guest, voucher="ABCDEFGHJK"):
    return ExperienceBooking(
        experience_id=exp.id, slot_id=slot.id, guest_id=guest.id, party_size=2, price_per_person=2500,
        value=5000, service_fee=250, taxes=630, total=5880, commission_percent=15, commission=750,
        charged_minor=588000, voucher_code=voucher,
    )


async def test_slot_check_constraint_rejects_overbooking(db_session):
    with pytest.raises(IntegrityError):
        await _seed(db_session, capacity=2, seats_booked=3)
        await db_session.commit()


async def test_payout_unique_per_booking(db_session):
    operator, guest, exp, slot = await _seed(db_session)
    booking = _booking(exp, slot, guest)
    db_session.add(booking)
    await db_session.flush()
    for _ in range(2):
        db_session.add(ExperiencePayout(
            booking_id=booking.id, operator_id=operator.id, gross_amount=5880, commission=750, fees=250,
            taxes=630, operator_amount=4250,
        ))
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_review_unique_per_booking(db_session):
    operator, guest, exp, slot = await _seed(db_session)
    booking = _booking(exp, slot, guest)
    db_session.add(booking)
    await db_session.flush()
    for _ in range(2):
        db_session.add(ExperienceReview(booking_id=booking.id, guest_id=guest.id, experience_id=exp.id, rating=5, text="ok"))
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_voucher_code_unique(db_session):
    operator, guest, exp, slot = await _seed(db_session)
    db_session.add(_booking(exp, slot, guest, "SAMECODE01"))
    db_session.add(_booking(exp, slot, guest, "SAMECODE01"))
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_payment_order_id_unique_and_defaults(db_session):
    operator, guest, exp, slot = await _seed(db_session)
    booking = _booking(exp, slot, guest)
    db_session.add(booking)
    await db_session.flush()
    payment = ExperiencePayment(booking_id=booking.id, razorpay_order_id="order_1", amount=588000, currency="INR")
    db_session.add(payment)
    await db_session.flush()
    assert payment.status == "created"
    assert booking.status == "pending"
    second = _booking(exp, slot, guest, "SECONDCODE")
    db_session.add(second)
    await db_session.flush()
    db_session.add(ExperiencePayment(booking_id=second.id, razorpay_order_id="order_1", amount=1, currency="INR"))
    with pytest.raises(IntegrityError):
        await db_session.commit()
