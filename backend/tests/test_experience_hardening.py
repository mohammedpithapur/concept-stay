"""Small hardening fixes from the Local Experiences review: slot-delete race, probing, pending-booking cap."""
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import utc_now
from app.models.experience import ExperienceBooking, ExperienceSlot
from app.services.experience_booking import MAX_PENDING_PER_GUEST, PENDING_TTL
from tests.experience_helpers import h
from tests.test_experience_bookings import (  # noqa: F401  (fixtures and helpers)
    _book, _guest, _paid, _rates, _setup, _verify, op, orders,
)
from tests.test_payouts import _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


async def test_delete_slot_hitting_the_booking_fk_is_409(client, orders, admin_token, op, db_session, monkeypatch):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    assert (await _book(client, guest, slot["id"], 1)).status_code == 200  # a pending booking row references the slot

    real_scalar = AsyncSession.scalar

    async def blind_to_bookings(self, statement, *args, **kwargs):
        if "experience_bookings" in str(statement):
            return None  # the operator's "any bookings?" check ran just before this booking appeared
        return await real_scalar(self, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "scalar", blind_to_bookings)
    res = await client.delete(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op))
    monkeypatch.setattr(AsyncSession, "scalar", real_scalar)
    assert res.status_code == 409, res.text
    await db_session.rollback()
    assert await db_session.get(ExperienceSlot, UUID(slot["id"])) is not None


async def test_other_guests_booking_is_404_on_verify_and_review(client, orders, admin_token, op):
    guest = await _guest(client)
    other = await _guest(client, "prober@example.com")
    eid, slot = await _setup(client, op, admin_token)
    order = (await _book(client, guest, slot["id"], 1)).json()
    bid = order["booking"]["id"]
    missing = str(uuid4())
    verify = await _verify(client, other, bid, order["razorpay_order_id"], "pay_x")
    unknown = await _verify(client, other, missing, order["razorpay_order_id"], "pay_x")
    assert verify.status_code == 404 and verify.json() == unknown.json()
    review = await client.post(f"/experience-bookings/{bid}/review", headers=h(other), json={"rating": 5, "text": "x"})
    unknown_review = await client.post(f"/experience-bookings/{missing}/review", headers=h(other), json={"rating": 5, "text": "x"})
    assert review.status_code == 404 and review.json() == unknown_review.json()


async def test_sixth_pending_booking_is_refused_and_paid_or_stale_ones_do_not_count(
    client, orders, admin_token, op, db_session
):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token, capacity=20)
    for _ in range(MAX_PENDING_PER_GUEST):
        assert (await _book(client, guest, slot["id"], 1)).status_code == 200
    refused = await _book(client, guest, slot["id"], 1)
    assert refused.status_code == 429, refused.text
    await db_session.rollback()
    assert await db_session.scalar(select(func.count()).select_from(ExperienceBooking)) == MAX_PENDING_PER_GUEST
    assert len(orders) == MAX_PENDING_PER_GUEST  # no Razorpay order was created for the refused one

    first = (await db_session.execute(select(ExperienceBooking).order_by(ExperienceBooking.created_at))).scalars().first()
    first.created_at = utc_now() - PENDING_TTL - timedelta(minutes=1)  # stale: no longer counts
    await db_session.commit()
    assert (await _book(client, guest, slot["id"], 1)).status_code == 200
    assert (await _book(client, guest, slot["id"], 1)).status_code == 429

    other = await _guest(client, "calm@example.com")  # the cap is per guest
    assert (await _book(client, other, slot["id"], 1)).status_code == 200
