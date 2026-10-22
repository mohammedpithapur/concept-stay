from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.experience import ExperienceBooking, ExperienceSlot
from app.models.user import User
from tests.experience_helpers import h, make_operator
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_experience_bookings import _book, _guest, _paid, _rates, _setup, orders  # noqa: F401
from tests.test_payouts import _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def op(client, admin_token):
    return await make_operator(client, admin_token, "oprev@example.com")


async def _started(db, slot_id):
    row = await db.get(ExperienceSlot, UUID(slot_id))
    row.starts_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await db.commit()


def _review(client, token, booking_id, rating=5, text="Lovely"):
    return client.post(f"/experience-bookings/{booking_id}/review", headers=h(token), json={"rating": rating, "text": text})


async def test_review_before_slot_started_is_409(client, orders, admin_token, op):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    booking = (await _paid(client, guest, slot["id"], 1))["booking"]["id"]
    assert (await _review(client, guest, booking)).status_code == 409


async def test_review_unpaid_or_refunded_is_409(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    pending = (await _book(client, guest, slot["id"], 1)).json()["booking"]["id"]
    await _started(db_session, slot["id"])
    assert (await _review(client, guest, pending)).status_code == 409
    row = await db_session.get(ExperienceBooking, UUID(pending))
    row.status = "refunded"
    await db_session.commit()
    assert (await _review(client, guest, pending)).status_code == 409


async def test_non_owner_is_403_and_unknown_is_404(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    other = await _guest(client, "other@example.com")
    eid, slot = await _setup(client, op, admin_token)
    booking = (await _paid(client, guest, slot["id"], 1))["booking"]["id"]
    await _started(db_session, slot["id"])
    assert (await _review(client, other, booking)).status_code == 403
    assert (await _review(client, other, "00000000-0000-0000-0000-000000000000")).status_code == 404


async def test_duplicate_is_409(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    booking = (await _paid(client, guest, slot["id"], 1))["booking"]["id"]
    await _started(db_session, slot["id"])
    assert (await _review(client, guest, booking)).status_code == 201
    assert (await _review(client, guest, booking, rating=1)).status_code == 409


async def test_rating_bounds_are_422(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    booking = (await _paid(client, guest, slot["id"], 1))["booking"]["id"]
    await _started(db_session, slot["id"])
    assert (await _review(client, guest, booking, rating=0)).status_code == 422
    assert (await _review(client, guest, booking, rating=6)).status_code == 422


async def test_rating_average_and_count_update(client, orders, admin_token, op, db_session):
    guest_a = await _guest(client, "ra@example.com")
    guest_b = await _guest(client, "rb@example.com")
    eid, slot = await _setup(client, op, admin_token)
    first = (await _paid(client, guest_a, slot["id"], 1, pay_id="pay_a"))["booking"]["id"]
    second = (await _paid(client, guest_b, slot["id"], 1, pay_id="pay_b"))["booking"]["id"]
    await _started(db_session, slot["id"])
    await _review(client, guest_a, first, rating=5)
    await _review(client, guest_b, second, rating=4)
    # the slot has started, so the public detail no longer lists it, but the experience stays visible via /reviews
    reviews = await client.get(f"/experiences/{eid}/reviews")
    assert reviews.status_code == 200 and len(reviews.json()) == 2
    from app.models.experience import Experience

    await db_session.rollback()
    exp = await db_session.get(Experience, UUID(eid))
    assert float(exp.avg_rating) == 4.5 and exp.review_count == 2


async def test_public_list_hides_last_name_and_orders_newest_first(client, orders, admin_token, op, db_session):
    guest_a = await _guest(client, "la@example.com")
    guest_b = await _guest(client, "lb@example.com")
    eid, slot = await _setup(client, op, admin_token)
    first = (await _paid(client, guest_a, slot["id"], 1, pay_id="pay_la"))["booking"]["id"]
    second = (await _paid(client, guest_b, slot["id"], 1, pay_id="pay_lb"))["booking"]["id"]
    for email, name in (("la@example.com", "Asha Verma"), ("lb@example.com", "Ravi Kumar")):
        user = await db_session.scalar(select(User).where(User.email == email))
        user.full_name = name
    await db_session.commit()
    await _started(db_session, slot["id"])
    await _review(client, guest_a, first, rating=5, text="first")
    await _review(client, guest_b, second, rating=3, text="second")
    body = (await client.get(f"/experiences/{eid}/reviews")).json()
    assert [r["text"] for r in body] == ["second", "first"]
    assert [r["guest_first_name"] for r in body] == ["Ravi", "Asha"]
    assert all(set(r) == {"rating", "text", "guest_first_name", "created_at"} for r in body)
    assert (await client.get("/experiences/00000000-0000-0000-0000-000000000000/reviews")).status_code == 404
