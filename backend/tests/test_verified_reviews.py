from datetime import date, timedelta

import pytest

from tests.test_host_listings import _h
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


def _ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def _ahead(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


def _review(**kw) -> dict:
    body = {"cleanliness": 5, "location": 4, "comfort": 4, "hospitality": 4, "accuracy": 4,
            "would_recommend": True, "comment": "Lovely stay"}
    body.update(kw)
    return body


async def _stayed(client, admin_headers, user_token, db_session, mark_completed=False, order="order_r"):
    """A paid booking whose stay is over."""
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_ago(10), check_out=_ago(7))
    assert (await _pay(client, db_session, user_token, booking, order=order, pay_id="pay_" + order)).status_code == 200
    if mark_completed:
        res = await client.patch(f"/bookings/admin/{booking['id']}", headers=admin_headers, json={"status": "completed"})
        assert res.status_code == 200
    return pid, booking


async def test_completed_booking_can_be_reviewed(client, admin_headers, user_token, db_session):
    pid, booking = await _stayed(client, admin_headers, user_token, db_session, mark_completed=True)
    res = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review())
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["rating"] == 4  # round(mean(5,4,4,4,4)) = round(4.2)
    assert body["cleanliness"] == 5 and body["would_recommend"] is True
    assert body["booking_id"] == booking["id"]
    prop = (await client.get(f"/properties/{pid}")).json()
    assert prop["review_count"] == 1 and prop["avg_rating"] == 4.0


async def test_paid_stay_past_checkout_is_eligible_and_gets_completed(client, admin_headers, user_token, db_session):
    _, booking = await _stayed(client, admin_headers, user_token, db_session)
    res = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review())
    assert res.status_code == 201, res.text
    mine = (await client.get("/bookings/mine", headers=_h(user_token))).json()["items"]
    assert mine[0]["status"] == "completed"


async def test_rating_rounds_up_from_point_six(client, admin_headers, user_token, db_session):
    _, booking = await _stayed(client, admin_headers, user_token, db_session)
    res = await client.post(
        f"/bookings/{booking['id']}/review", headers=_h(user_token),
        json=_review(cleanliness=5, location=5, comfort=5, hospitality=4, accuracy=4),
    )
    assert res.json()["rating"] == 5  # 23/5 = 4.6


async def test_future_confirmed_booking_cannot_be_reviewed(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_ahead(30), check_out=_ahead(33))
    await _pay(client, db_session, user_token, booking, order="order_f", pay_id="pay_f")
    res = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review())
    assert res.status_code == 409


async def test_unpaid_pending_and_cancelled_cannot_be_reviewed(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    pending = await _book(client, user_token, pid, check_in=_ago(10), check_out=_ago(7))
    res = await client.post(f"/bookings/{pending['id']}/review", headers=_h(user_token), json=_review())
    assert res.status_code == 409
    await client.patch(f"/bookings/admin/{pending['id']}", headers=admin_headers, json={"status": "cancelled"})
    res = await client.post(f"/bookings/{pending['id']}/review", headers=_h(user_token), json=_review())
    assert res.status_code == 409


async def test_only_the_booking_guest_can_review(client, admin_headers, user_token, db_session):
    _, booking = await _stayed(client, admin_headers, user_token, db_session)
    other = await client.post(
        "/auth/register", json={"email": "other2@example.com", "password": "OtherPass123!", "full_name": "Other"}
    )
    res = await client.post(f"/bookings/{booking['id']}/review", headers=_h(other.json()["access_token"]), json=_review())
    assert res.status_code == 403
    assert (await client.post(f"/bookings/{booking['id']}/review", json=_review())).status_code in (401, 403)


async def test_second_review_for_same_booking_rejected(client, admin_headers, user_token, db_session):
    pid, booking = await _stayed(client, admin_headers, user_token, db_session)
    first = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review())
    assert first.status_code == 201
    second = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review(comment="again"))
    assert second.status_code == 409
    assert (await client.get(f"/properties/{pid}")).json()["review_count"] == 1


@pytest.mark.parametrize("bad", [{"cleanliness": 0}, {"location": 6}, {"comfort": "great"}, {"would_recommend": None}])
async def test_invalid_review_payload_rejected(client, admin_headers, user_token, db_session, bad):
    _, booking = await _stayed(client, admin_headers, user_token, db_session)
    res = await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review(**bad))
    assert res.status_code == 422


async def test_review_summary(client, admin_headers, user_token, db_session):
    pid, booking = await _stayed(client, admin_headers, user_token, db_session)
    empty = (await client.get(f"/properties/{pid}/review-summary")).json()
    assert empty == {"count": 0, "overall": 0.0, "recommend_percent": None, "categories": {}}
    await client.post(f"/bookings/{booking['id']}/review", headers=_h(user_token), json=_review(would_recommend=False))
    summary = (await client.get(f"/properties/{pid}/review-summary")).json()
    assert summary["count"] == 1
    assert summary["recommend_percent"] == 0
    assert summary["categories"] == {"cleanliness": 5.0, "location": 4.0, "comfort": 4.0, "hospitality": 4.0, "accuracy": 4.0}
