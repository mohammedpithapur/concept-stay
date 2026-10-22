from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.database import utc_now
from app.models.booking import Booking
from app.models.experience import ExperienceBooking
from app.models.payout import Payout
from tests.experience_helpers import h, make_operator
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_experience_bookings import _guest, _paid, _rates, _setup, orders  # noqa: F401
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


async def _stay(client, admin_headers, db_session, token, pid, start, order):
    booking = await _book(client, token, pid, check_in=f"2031-{start}-01", check_out=f"2031-{start}-04")
    res = await _pay(client, db_session, token, booking, order=order, pay_id=f"pay_{order}")
    assert res.status_code == 200, res.text
    return booking["id"]


@pytest.fixture
async def world(client, orders, admin_headers, admin_token, db_session):
    """A: stay (2250 + 750) and experience (750 + 250) = 4000.  B: stay only = 3000.  C: experience only = 1000."""
    op = await make_operator(client, admin_token, "opreport@example.com")
    pid = await _listing(client, admin_headers)
    eid, slot = await _setup(client, op, admin_token, capacity=6)
    tokens = {name: await _guest(client, f"{name}@example.com") for name in ("a", "b", "c")}
    stays = {
        "a": await _stay(client, admin_headers, db_session, tokens["a"], pid, "05", "order_a"),
        "b": await _stay(client, admin_headers, db_session, tokens["b"], pid, "06", "order_b"),
    }
    exps = {
        "a": (await _paid(client, tokens["a"], slot["id"], 2, pay_id="pay_ea"))["booking"]["id"],
        "c": (await _paid(client, tokens["c"], slot["id"], 2, pay_id="pay_ec"))["booking"]["id"],
    }
    return {"tokens": tokens, "stays": stays, "exps": exps}


async def _report(client, admin_token, **params):
    res = await client.get("/admin/traveller-report", headers=h(admin_token), params=params)
    assert res.status_code == 200, res.text
    return res.json()


def _rows(report):
    return [(r["email"], r["stay_revenue"], r["experience_revenue"], r["total_revenue"]) for r in report["items"]]


async def test_traveller_with_stay_and_experience_sums_both_and_one_sided_appear(client, admin_token, world):
    report = await _report(client, admin_token)
    assert report["total"] == 3
    assert _rows(report) == [
        ("a@example.com", 3000, 1000, 4000),
        ("b@example.com", 3000, 0, 3000),
        ("c@example.com", 0, 1000, 1000),
    ]


async def test_refunded_and_voided_count_zero(client, fake_razorpay, admin_token, world, db_session):
    await client.post(f"/admin/experience-bookings/{world['exps']['c']}/refund", headers=h(admin_token))
    await db_session.execute(update(Payout).where(Payout.booking_id == world["stays"]["b"]).values(status="voided"))
    await db_session.commit()
    assert _rows(await _report(client, admin_token)) == [("a@example.com", 3000, 1000, 4000)]


async def test_date_range_filters(client, admin_token, world, db_session):
    old = utc_now() - timedelta(days=40)
    await db_session.execute(update(Booking).where(Booking.id == world["stays"]["b"]).values(created_at=old))
    await db_session.execute(update(ExperienceBooking).where(ExperienceBooking.id == world["exps"]["a"]).values(created_at=old))
    await db_session.commit()
    today = utc_now().date().isoformat()
    recent = await _report(client, admin_token, **{"from": today})
    assert _rows(recent) == [("a@example.com", 3000, 0, 3000), ("c@example.com", 0, 1000, 1000)]
    past = await _report(client, admin_token, to=(utc_now() - timedelta(days=30)).date().isoformat())
    assert _rows(past) == [("b@example.com", 3000, 0, 3000), ("a@example.com", 0, 1000, 1000)]


async def test_pagination_and_sort_order(client, admin_token, world):
    page = await _report(client, admin_token, limit=1, offset=1)
    assert page["total"] == 3
    assert _rows(page) == [("b@example.com", 3000, 0, 3000)]
    assert (await client.get("/admin/traveller-report", headers=h(admin_token), params={"limit": 500})).status_code == 422


async def test_non_admin_is_403(client, user_token):
    assert (await client.get("/admin/traveller-report", headers=h(user_token))).status_code == 403
