from datetime import date, timedelta

import pytest

from app.services import booking as booking_service
from tests.test_host_listings import _h
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _unthrottled():
    booking_service._last_complete_time = 0.0


def _day(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


async def _status(client, user_token) -> str:
    return (await client.get("/bookings/mine", headers=_h(user_token))).json()["items"][0]["status"]


async def test_finished_paid_booking_becomes_completed(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_day(-5), check_out=_day(-2))
    await _pay(client, db_session, user_token, booking, order="order_a", pay_id="pay_a")
    assert await _status(client, user_token) == "completed"


async def test_unpaid_or_future_not_completed(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    future = await _book(client, user_token, pid, check_in=_day(20), check_out=_day(23))
    await _pay(client, db_session, user_token, future, order="order_b", pay_id="pay_b")
    unpaid = await _book(client, user_token, pid, check_in=_day(-5), check_out=_day(-2))
    items = (await client.get("/bookings/mine", headers=_h(user_token))).json()["items"]
    by_id = {b["id"]: b["status"] for b in items}
    assert by_id[future["id"]] == "confirmed"
    assert by_id.get(unpaid["id"], "pending") == "pending"


async def test_cancelled_never_completed(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_day(-5), check_out=_day(-2))
    await client.patch(f"/bookings/admin/{booking['id']}", headers=admin_headers, json={"status": "cancelled"})
    assert await _status(client, user_token) == "cancelled"


async def test_review_allowed_without_admin_step(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_day(-5), check_out=_day(-2))
    await _pay(client, db_session, user_token, booking, order="order_c", pay_id="pay_c")
    body = {"cleanliness": 5, "location": 5, "comfort": 5, "hospitality": 5, "accuracy": 5, "would_recommend": True}
    res = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=body)
    assert res.status_code == 201, res.text
