import hashlib
import hmac
import json
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.models.booking import Booking
from app.models.payment import Payment, RazorpayPaymentStatus
from app.models.payout import Payout
from app.services import refunds
from app.services.cancellation import compute_refund, refund_deadline
from tests.test_host_listings import _h
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


def test_refund_boundary():
    booked = datetime(2031, 1, 1, 12, 0, 0)
    future = date(2031, 3, 1)
    assert compute_refund(1000, booked, booked + timedelta(days=10), future) == 1000
    assert compute_refund(1000, booked, booked + timedelta(days=10, seconds=1), future) == 0
    assert compute_refund(1000, booked, booked, future) == 1000


def test_no_refund_once_stay_started_even_inside_window():
    booked = datetime(2031, 1, 1, 12, 0, 0)
    now = booked + timedelta(days=2)
    assert compute_refund(1000, booked, now, date(2031, 1, 3)) == 0  # check-in is today (IST)
    assert compute_refund(1000, booked, now, date(2031, 1, 2)) == 0


def test_refund_deadline_is_ten_days_after_booking():
    booked = datetime(2031, 1, 1, 12, 0, 0)
    assert refund_deadline(booked) == datetime(2031, 1, 11, 12, 0, 0)


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


async def test_cancel_after_window_gets_no_refund_and_keeps_payout(
    client, admin_headers, user_token, db_session, fake_razorpay
):
    booking = await _paid_booking(client, admin_headers, user_token, db_session)
    row = await db_session.get(Booking, booking["id"])
    row.created_at = row.created_at - timedelta(days=11)
    await db_session.commit()
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "cancelled"
    assert body["refund_amount"] == 0
    assert body["payment_status"] == "paid"
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
    booking = await _paid_booking(client, admin_headers, user_token, db_session, days_ahead=10)
    prev = await client.get(f"/bookings/{booking['id']}/refund-preview", headers=_h(user_token))
    assert prev.status_code == 200
    body = prev.json()
    assert "policy" not in body
    assert (body["can_cancel"], body["refund_amount"], body["total_paid"]) == (True, booking["total"], booking["total"])
    row = await db_session.get(Booking, booking["id"])
    assert datetime.fromisoformat(body["refund_deadline"]) == row.created_at + timedelta(days=10)
    assert fake_razorpay == []  # preview never refunds

    row.created_at = row.created_at - timedelta(days=11)
    await db_session.commit()
    late = await client.get(f"/bookings/{booking['id']}/refund-preview", headers=_h(user_token))
    assert late.json()["refund_amount"] == 0


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


async def test_payment_after_pending_cancel_does_not_resurrect_booking(
    client, admin_headers, user_token, db_session, fake_razorpay
):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_days_ahead(60), check_out=_days_ahead(63))
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled"

    res = await _pay(client, db_session, user_token, booking)  # checkout opened earlier completes late
    assert res.status_code == 409, res.text

    db_session.expire_all()
    b = await db_session.get(Booking, booking["id"])
    assert b.status.value == "cancelled"
    assert (await db_session.scalar(select(func.count()).select_from(Payout))) == 0
    assert len(fake_razorpay) == 1  # late payment refunded in full
    assert fake_razorpay[0][1]["amount"] == booking["total"] * 100


async def test_partial_refund_webhook_rescales_payout_not_void(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_days_ahead(60), check_out=_days_ahead(63))
    await _pay(client, db_session, user_token, booking, order="order_p", pay_id="pay_p")
    half = booking["total"] // 2
    body = json.dumps({"event": "refund.created", "payload": {"refund": {"entity": {
        "payment_id": "pay_p", "amount": half * 100}}}}).encode()
    sig = hmac.new(b"testsecret", body, hashlib.sha256).hexdigest()
    wh = await client.post("/payments/webhook", content=body, headers={"X-Razorpay-Signature": sig})
    assert wh.status_code == 200

    db_session.expire_all()
    payout = await db_session.scalar(select(Payout).where(Payout.booking_id == booking["id"]))
    assert payout.status == "owed"
    assert 0 < payout.host_amount < 13550
    payment = await db_session.scalar(select(Payment).where(Payment.booking_id == booking["id"]))
    assert payment.status.value == "paid"
    b = await db_session.get(Booking, booking["id"])
    assert b.refund_amount == half


async def test_repriced_pending_booking_gets_fresh_order(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid, check_in=_days_ahead(60), check_out=_days_ahead(63), guests=2)
    db_session.add(Payment(booking_id=booking["id"], razorpay_order_id="order_old", amount=(booking["total"] - 500) * 100,
                           status=RazorpayPaymentStatus.created))
    await db_session.commit()
    again = await _book(client, user_token, pid, check_in=_days_ahead(60), check_out=_days_ahead(63), guests=3)
    assert again["id"] == booking["id"]
    old = await db_session.scalar(select(Payment).where(Payment.razorpay_order_id == "order_old"))
    # a stale order whose amount no longer matches the booking must not be reused
    assert old is None or old.amount == again["total"] * 100
