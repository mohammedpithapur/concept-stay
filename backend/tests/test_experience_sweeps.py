from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from app.database import utc_now
from app.models.experience import Experience, ExperienceBooking, ExperiencePayment, ExperienceSlot
from app.services.experience_booking import (
    complete_finished_experience_bookings, expire_stale_experience_bookings,
)
from tests.experience_helpers import add_slot, create_live_experience, make_operator

pytestmark = pytest.mark.asyncio


async def _slot(client, admin_token):
    op = await make_operator(client, admin_token, "opsweep@example.com")
    eid = await create_live_experience(client, op, admin_token, duration_minutes=120)
    return eid, await add_slot(client, op, eid)


async def _booking(db, client, eid, slot_id, code, status, age_minutes=0, payment_status="created"):
    from app.models.user import User
    from sqlalchemy import select

    guest = (await db.execute(select(User).where(User.email == "sweepguest@example.com"))).scalar_one_or_none()
    if guest is None:
        guest = User(email="sweepguest@example.com", password_hash="x", full_name="Guest")
        db.add(guest)
        await db.flush()
    booking = ExperienceBooking(
        experience_id=UUID(eid), slot_id=UUID(slot_id), guest_id=guest.id, party_size=1, price_per_person=2500,
        value=2500, service_fee=125, taxes=315, total=2940, commission_percent=15, commission=375,
        charged_minor=294000, voucher_code=code, status=status, created_at=utc_now() - timedelta(minutes=age_minutes),
    )
    db.add(booking)
    await db.flush()
    db.add(ExperiencePayment(booking_id=booking.id, razorpay_order_id=f"order_{code}", amount=294000, currency="INR", status=payment_status))
    await db.commit()
    return booking.id


async def test_stale_pending_expires_but_fresh_does_not(client, admin_token, db_session):
    eid, slot = await _slot(client, admin_token)
    stale = await _booking(db_session, client, eid, slot["id"], "STALE00001", "pending", age_minutes=31)
    fresh = await _booking(db_session, client, eid, slot["id"], "FRESH00001", "pending", age_minutes=5)
    assert await expire_stale_experience_bookings(db_session) == 1
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, stale)).status == "expired"
    assert (await db_session.get(ExperienceBooking, fresh)).status == "pending"
    stale_payment = await db_session.get(ExperiencePayment, (await _payment_id(db_session, stale)))
    assert stale_payment.status == "failed"


async def _payment_id(db, booking_id):
    from sqlalchemy import select
    return await db.scalar(select(ExperiencePayment.id).where(ExperiencePayment.booking_id == booking_id))


async def test_paid_booking_never_expires(client, admin_token, db_session):
    eid, slot = await _slot(client, admin_token)
    paid = await _booking(db_session, client, eid, slot["id"], "PAID000001", "confirmed", age_minutes=600, payment_status="paid")
    assert await expire_stale_experience_bookings(db_session) == 0
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, paid)).status == "confirmed"


async def test_finished_confirmed_becomes_completed_and_future_stays_confirmed(client, admin_token, db_session):
    eid, slot = await _slot(client, admin_token)
    done = await _booking(db_session, client, eid, slot["id"], "DONE000001", "confirmed", payment_status="paid")
    future = await _booking(db_session, client, eid, slot["id"], "FUTURE0001", "confirmed", payment_status="paid")
    pending = await _booking(db_session, client, eid, slot["id"], "PEND000001", "pending")
    # Move the slot so it started 3 hours ago: with a 120 minute duration it has finished. The "future" booking
    # goes to a second slot that has not started.
    row = await db_session.get(ExperienceSlot, UUID(slot["id"]))
    row.starts_at = datetime.now(timezone.utc) - timedelta(hours=3)
    later = ExperienceSlot(experience_id=UUID(eid), starts_at=datetime.now(timezone.utc) + timedelta(days=2), capacity=4, seats_booked=0)
    db_session.add(later)
    await db_session.flush()
    (await db_session.get(ExperienceBooking, future)).slot_id = later.id
    await db_session.commit()
    assert await complete_finished_experience_bookings(db_session) == 1
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, done)).status == "completed"
    assert (await db_session.get(ExperienceBooking, future)).status == "confirmed"
    assert (await db_session.get(ExperienceBooking, pending)).status == "pending"
    assert await complete_finished_experience_bookings(db_session) == 0


async def test_slot_still_running_is_not_completed(client, admin_token, db_session):
    eid, slot = await _slot(client, admin_token)
    running = await _booking(db_session, client, eid, slot["id"], "RUN0000001", "confirmed", payment_status="paid")
    row = await db_session.get(ExperienceSlot, UUID(slot["id"]))
    row.starts_at = datetime.now(timezone.utc) - timedelta(minutes=30)  # 120 minute experience, half an hour in
    await db_session.commit()
    assert await complete_finished_experience_bookings(db_session) == 0
