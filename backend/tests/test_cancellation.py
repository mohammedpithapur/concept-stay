from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.booking import Booking
from app.models.payment import Payment
from app.models.payout import Payout
from app.services import refunds
from app.services.cancellation import compute_refund
from tests.test_host_listings import _h
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize(
    "policy,days,expected",
    [
        ("flexible", 30, 1000),
        ("flexible", 5, 1000),
        ("flexible", 4, 0),
        ("flexible", 0, 0),
        ("moderate", 30, 1000),
        ("moderate", 14, 1000),
        ("moderate", 13, 500),
        ("moderate", 5, 500),
        ("moderate", 4, 0),
        ("moderate", 0, 0),
        ("non_refundable", 90, 0),
    ],
)
def test_compute_refund_boundaries(policy, days, expected):
    today = date(2031, 1, 1)
    assert compute_refund(policy, 1000, today + timedelta(days=days), today) == expected


def test_compute_refund_unknown_policy_is_non_refundable_and_past_checkin_is_zero():
    today = date(2031, 1, 10)
    assert compute_refund("mystery", 1000, today + timedelta(days=60), today) == 0
    assert compute_refund("flexible", 1000, today - timedelta(days=1), today) == 0


@pytest.fixture
def fake_razorpay(monkeypatch):
    calls: list[tuple] = []

    class _Payment:
        def refund(self, payment_id, data):
            calls.append((payment_id, data))
            return {"id": "rfnd_1"}

    monkeypatch.setattr(refunds, "get_razorpay_client", lambda: SimpleNamespace(payment=_Payment()))
    monkeypatch.setattr(refunds.settings, "RAZORPAY_KEY_ID", "rzp_test")
    return calls


def _days_ahead(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


async def _paid_booking(client, admin_headers, user_token, db_session, days_ahead=60, **listing):
    pid = await _listing(client, admin_headers, **listing)
    booking = await _book(
        client, user_token, pid, check_in=_days_ahead(days_ahead), check_out=_days_ahead(days_ahead + 3)
    )
    res = await _pay(client, db_session, user_token, booking)
    assert res.status_code == 200, res.text
    return booking


async def test_flexible_full_refund_voids_payout(client, admin_headers, user_token, db_session, fake_razorpay):
    booking = await _paid_booking(client, admin_headers, user_token, db_session)
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "cancelled"
    assert body["payment_status"] == "refunded"
    assert body["refund_amount"] == booking["total"]
    assert fake_razorpay == [("pay_1", {"amount": booking["total"] * 100, "speed": "normal"})]

    payout = (await db_session.execute(select(Payout))).scalar_one()
    assert payout.status == "voided"
    assert payout.host_amount == 0

    again = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert again.status_code == 409
    assert len(fake_razorpay) == 1  # never refunded twice


async def test_moderate_partial_refund_rescales_payout(client, admin_headers, user_token, db_session, fake_razorpay):
    booking = await _paid_booking(
        client, admin_headers, user_token, db_session, days_ahead=10, cancellation_policy="moderate"
    )
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200, res.text
    refund = res.json()["refund_amount"]
    assert refund == booking["total"] // 2
    assert fake_razorpay[0][1]["amount"] == refund * 100

    retained = booking["total"] - refund
    payout = (await db_session.execute(select(Payout))).scalar_one()
    assert payout.status == "owed"
    assert payout.gross_amount == retained
    assert 0 < payout.host_amount < 13550
    assert payout.gross_amount == payout.host_amount + payout.commission + payout.fees + payout.taxes


async def test_non_refundable_cancels_without_refund(client, admin_headers, user_token, db_session, fake_razorpay):
    booking = await _paid_booking(client, admin_headers, user_token, db_session, cancellation_policy="non_refundable")
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert res.json()["refund_amount"] == 0
    assert res.json()["payment_status"] == "paid"
    assert fake_razorpay == []
    payout = (await db_session.execute(select(Payout))).scalar_one()
    assert payout.status == "owed" and payout.gross_amount == booking["total"]


async def test_unpaid_pending_booking_cancels_without_refund(client, admin_headers, user_token, fake_razorpay):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_days_ahead(40), check_out=_days_ahead(42))
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled" and res.json()["refund_amount"] == 0
    assert fake_razorpay == []


async def test_cannot_cancel_on_or_after_check_in(client, admin_headers, user_token, db_session, fake_razorpay):
    booking = await _paid_booking(client, admin_headers, user_token, db_session, days_ahead=0)
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 409
    assert fake_razorpay == []
    row = await db_session.get(Booking, booking["id"])
    assert row.status.value == "confirmed"


async def test_only_owner_can_cancel(client, admin_headers, user_token, admin_token, db_session, fake_razorpay):
    booking = await _paid_booking(client, admin_headers, user_token, db_session)
    other = await client.post(
        "/auth/register", json={"email": "other@example.com", "password": "OtherPass123!", "full_name": "Other"}
    )
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(other.json()["access_token"]))
    assert res.status_code == 403
    assert fake_razorpay == []


async def test_gateway_failure_keeps_booking_confirmed(client, admin_headers, user_token, db_session, monkeypatch):
    class _Boom:
        def refund(self, *_a, **_k):
            raise RuntimeError("gateway down")

    monkeypatch.setattr(refunds, "get_razorpay_client", lambda: SimpleNamespace(payment=_Boom()))
    monkeypatch.setattr(refunds.settings, "RAZORPAY_KEY_ID", "rzp_test")
    booking = await _paid_booking(client, admin_headers, user_token, db_session)
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 502
    row = await db_session.get(Booking, booking["id"])
    await db_session.refresh(row)
    assert row.status.value == "confirmed" and row.payment_status.value == "paid"
    payment = (await db_session.execute(select(Payment))).scalar_one()
    assert payment.status.value == "paid"


async def test_refund_preview_matches_cancel(client, admin_headers, user_token, db_session, fake_razorpay):
    booking = await _paid_booking(
        client, admin_headers, user_token, db_session, days_ahead=10, cancellation_policy="moderate"
    )
    prev = await client.get(f"/bookings/{booking['id']}/refund-preview", headers=_h(user_token))
    assert prev.status_code == 200
    assert prev.json() == {
        "can_cancel": True,
        "policy": "moderate",
        "refund_amount": booking["total"] // 2,
        "total_paid": booking["total"],
    }
    assert fake_razorpay == []  # preview never refunds


async def test_admin_full_refund_voids_owed_payout(
    client, admin_headers, user_token, db_session, fake_razorpay, monkeypatch
):
    from app.routers import payments as payments_router

    booking = await _paid_booking(client, admin_headers, user_token, db_session)
    payment = await db_session.scalar(select(Payment).where(Payment.booking_id == booking["id"]))
    payment.razorpay_payment_id = "pay_admin_refund"
    await db_session.commit()
    monkeypatch.setattr(payments_router, "_get_razorpay_client", lambda: SimpleNamespace(payment=SimpleNamespace(refund=lambda *a, **k: {})))
    monkeypatch.setattr(payments_router.settings, "RAZORPAY_KEY_ID", "rzp_test")
    monkeypatch.setattr(payments_router.settings, "RAZORPAY_KEY_SECRET", "secret")

    res = await client.post(f"/payments/{payment.id}/refund", headers=admin_headers)
    assert res.status_code == 200, res.text

    db_session.expire_all()
    payout = await db_session.scalar(select(Payout).where(Payout.booking_id == booking["id"]))
    assert payout.status == "voided"
    assert payout.host_amount == 0
