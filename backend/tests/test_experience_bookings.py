import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.models.experience import (
    ExperienceBooking, ExperiencePayment, ExperiencePayout, ExperienceSlot,
)
from tests.experience_helpers import add_slot, create_live_experience, h, make_operator
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_international import orders  # noqa: F401  (fixture)
from tests.test_payouts import SECRET, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _rates(monkeypatch):
    monkeypatch.setattr(settings, "GUEST_SERVICE_FEE_PERCENT", 5)
    monkeypatch.setattr(settings, "TAX_PERCENT", 12)
    monkeypatch.setattr(settings, "EXPERIENCE_COMMISSION_PERCENT", 15)


@pytest.fixture
async def op(client, admin_token):
    return await make_operator(client, admin_token, "opbook@example.com")


async def _guest(client, email="guest1@example.com") -> str:
    reg = await client.post("/auth/register", json={"email": email, "password": "GuestPass123!", "full_name": email.split("@")[0]})
    return reg.json()["access_token"]


async def _setup(client, op, admin_token, hours=72, capacity=4, **overrides):
    eid = await create_live_experience(client, op, admin_token, **overrides)
    slot = await add_slot(client, op, eid, hours=hours, capacity=capacity)
    return eid, slot


async def _book(client, token, slot_id, party=2, currency=None):
    body = {"slot_id": slot_id, "party_size": party}
    if currency:
        body["currency"] = currency
    return await client.post("/experience-bookings", headers=h(token), json=body)


def _sig(order_id, pay_id):
    return hmac.new(SECRET.encode(), f"{order_id}|{pay_id}".encode(), hashlib.sha256).hexdigest()


async def _verify(client, token, booking_id, order_id, pay_id):
    return await client.post(
        f"/experience-bookings/{booking_id}/verify", headers=h(token),
        json={"razorpay_order_id": order_id, "razorpay_payment_id": pay_id, "razorpay_signature": _sig(order_id, pay_id)},
    )


async def _webhook(client, event, entity):
    payload = {"event": event, "payload": {("refund" if event.startswith("refund") else "payment"): {"entity": entity}}}
    body = json.dumps(payload).encode()
    sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    return await client.post("/payments/webhook", content=body, headers={"X-Razorpay-Signature": sig})


async def _captured(client, order_id, pay_id):
    return await _webhook(client, "payment.captured", {"order_id": order_id, "id": pay_id})


async def _count(db, model):
    return await db.scalar(select(func.count()).select_from(model))


async def _paid(client, token, slot_id, party=2, pay_id="pay_1"):
    res = await _book(client, token, slot_id, party)
    assert res.status_code == 200, res.text
    order = res.json()
    verified = await _verify(client, token, order["booking"]["id"], order["razorpay_order_id"], pay_id)
    assert verified.status_code == 200, verified.text
    return order


async def test_booking_requires_login(client, orders, admin_token, op):
    eid, slot = await _setup(client, op, admin_token)
    res = await client.post("/experience-bookings", json={"slot_id": slot["id"], "party_size": 1})
    assert res.status_code in (401, 403)


async def test_cannot_book_past_or_within_cutoff_slot(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, soon = await _setup(client, op, admin_token, hours=0.5)
    assert (await _book(client, guest, soon["id"], 1)).status_code == 422
    eid2, past = await _setup(client, op, admin_token, title="Past")
    row = await db_session.get(ExperienceSlot, UUID(past["id"]))
    row.starts_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await db_session.commit()
    assert (await _book(client, guest, past["id"], 1)).status_code == 422
    assert orders == []


async def test_party_size_bounds(client, orders, admin_token, op):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token, capacity=3)
    assert (await _book(client, guest, slot["id"], 0)).status_code == 422
    assert (await _book(client, guest, slot["id"], 21)).status_code == 422
    assert (await _book(client, guest, slot["id"], 4)).status_code == 409


async def test_gateway_not_configured_is_503_and_creates_nothing(client, admin_token, op, db_session, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "")
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    assert (await _book(client, guest, slot["id"], 1)).status_code == 503
    assert await _count(db_session, ExperienceBooking) == 0


async def test_create_snapshots_commission_and_price(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    res = await _book(client, guest, slot["id"], 2)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["amount"] == 588000 and body["currency"] == "INR" and body["key_id"] == "rzp_test"
    assert (body["booking"]["value"], body["booking"]["service_fee"], body["booking"]["taxes"], body["booking"]["total"]) == (5000, 250, 630, 5880)
    assert body["booking"]["status"] == "pending" and body["booking"]["voucher_code"] is None
    assert orders[0]["amount"] == 588000 and orders[0]["currency"] == "INR"
    await client.put("/admin/settings/experience-commission", headers=h(admin_token), json={"percent": 30})
    await _verify(client, guest, body["booking"]["id"], body["razorpay_order_id"], "pay_1")
    booking = await db_session.get(ExperienceBooking, UUID(body["booking"]["id"]))
    payout = await db_session.scalar(select(ExperiencePayout))
    assert booking.commission_percent == 15 and booking.commission == 750
    assert payout.commission == 750 and payout.operator_amount == 4250


async def test_verify_confirms_takes_seats_and_creates_payout(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = await _paid(client, guest, slot["id"], 2)
    await db_session.rollback()
    row = await db_session.get(ExperienceSlot, UUID(slot["id"]))
    payout = await db_session.scalar(select(ExperiencePayout))
    assert row.seats_booked == 2
    assert (payout.gross_amount, payout.commission, payout.fees, payout.taxes, payout.operator_amount, payout.status) == (5880, 750, 250, 630, 4250, "owed")
    detail = (await client.get(f"/experience-bookings/{order['booking']['id']}", headers=h(guest))).json()
    assert detail["status"] == "confirmed"
    assert detail["voucher_code"] and detail["meeting_point"] == "Main gate, Tea Museum road"
    assert detail["operator_email"] == "opbook@example.com"


async def test_verify_then_webhook_one_payout_one_seat_deduction(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = await _paid(client, guest, slot["id"], 2, pay_id="pay_dup")
    assert (await _captured(client, order["razorpay_order_id"], "pay_dup")).status_code == 200
    await db_session.rollback()
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 2
    assert await _count(db_session, ExperiencePayout) == 1


async def test_webhook_then_verify_and_webhook_twice_are_idempotent(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = (await _book(client, guest, slot["id"], 2)).json()
    await _captured(client, order["razorpay_order_id"], "pay_w")
    await _captured(client, order["razorpay_order_id"], "pay_w")
    again = await _verify(client, guest, order["booking"]["id"], order["razorpay_order_id"], "pay_w")
    assert again.status_code == 200 and again.json()["status"] == "confirmed"
    await db_session.rollback()
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 2
    assert await _count(db_session, ExperiencePayout) == 1


async def test_last_seat_race_second_payer_refunded_in_full(client, orders, fake_razorpay, admin_token, op, db_session):
    guest_a = await _guest(client, "racea@example.com")
    guest_b = await _guest(client, "raceb@example.com")
    eid, slot = await _setup(client, op, admin_token, capacity=1)
    order_a = (await _book(client, guest_a, slot["id"], 1)).json()
    order_b = (await _book(client, guest_b, slot["id"], 1)).json()  # no hold: both can start paying
    first = await _verify(client, guest_a, order_a["booking"]["id"], order_a["razorpay_order_id"], "pay_a")
    assert first.status_code == 200
    second = await _verify(client, guest_b, order_b["booking"]["id"], order_b["razorpay_order_id"], "pay_b")
    assert second.status_code == 409
    assert "refunded" in second.json()["detail"]
    await db_session.rollback()
    loser = await db_session.get(ExperienceBooking, UUID(order_b["booking"]["id"]))
    loser_payment = await db_session.scalar(select(ExperiencePayment).where(ExperiencePayment.booking_id == loser.id))
    assert loser.status == "failed_full" and loser_payment.status == "refunded"
    assert fake_razorpay == [("pay_b", {"amount": 294000, "speed": "normal"})]
    assert await _count(db_session, ExperiencePayout) == 1
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 1
    # the gateway webhook for the same lost payment must not resurrect it
    await _captured(client, order_b["razorpay_order_id"], "pay_b")
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, UUID(order_b["booking"]["id"]))).status == "failed_full"
    assert await _count(db_session, ExperiencePayout) == 1


async def test_bad_signature_is_400_and_booking_stays_pending(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = (await _book(client, guest, slot["id"], 1)).json()
    res = await client.post(
        f"/experience-bookings/{order['booking']['id']}/verify", headers=h(guest),
        json={"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": "pay_x", "razorpay_signature": "bad"},
    )
    assert res.status_code == 400
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, UUID(order["booking"]["id"]))).status == "pending"


async def test_other_user_cannot_verify_or_read(client, orders, admin_token, op):
    guest = await _guest(client)
    other = await _guest(client, "other@example.com")
    eid, slot = await _setup(client, op, admin_token)
    order = (await _book(client, guest, slot["id"], 1)).json()
    bid = order["booking"]["id"]
    assert (await _verify(client, other, bid, order["razorpay_order_id"], "pay_o")).status_code == 404
    assert (await client.get(f"/experience-bookings/{bid}", headers=h(other))).status_code == 404
    assert (await client.get("/experience-bookings/mine", headers=h(other))).json() == []
    assert [b["id"] for b in (await client.get("/experience-bookings/mine", headers=h(guest))).json()] == [bid]


async def test_voucher_hidden_until_confirmed(client, orders, admin_token, op):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = (await _book(client, guest, slot["id"], 1)).json()
    pending = (await client.get(f"/experience-bookings/{order['booking']['id']}", headers=h(guest))).json()
    assert pending["status"] == "pending"
    assert pending["meeting_point"] is None and pending["voucher_code"] is None and pending["operator_email"] is None


async def test_international_currency_charged_minor(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    await client.put("/admin/fx-rates/USD", headers=h(admin_token), json={"rate_per_inr": "0.012"})
    res = await _book(client, guest, slot["id"], 2, currency="USD")
    assert res.status_code == 200, res.text
    assert res.json()["amount"] == 7056 and res.json()["currency"] == "USD"
    assert orders[0]["amount"] == 7056 and orders[0]["currency"] == "USD"
    await client.put("/admin/fx-rates/USD", headers=h(admin_token), json={"rate_per_inr": "0.02"})  # later change must not matter
    booking = await db_session.get(ExperienceBooking, UUID(res.json()["booking"]["id"]))
    assert booking.charged_minor == 7056 and str(booking.fx_rate).startswith("0.012")
    bad = await _book(client, guest, slot["id"], 1, currency="XYZ")
    assert bad.status_code == 422


async def test_payment_failed_expires_booking_and_late_capture_still_confirms(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = (await _book(client, guest, slot["id"], 1)).json()
    await _webhook(client, "payment.failed", {"order_id": order["razorpay_order_id"]})
    await db_session.rollback()
    booking = await db_session.get(ExperienceBooking, UUID(order["booking"]["id"]))
    assert booking.status == "expired"
    await _captured(client, order["razorpay_order_id"], "pay_retry")  # the guest retried and the second attempt worked
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, UUID(order["booking"]["id"]))).status == "confirmed"
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 1


async def test_refund_webhook_syncs_state_once(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = await _paid(client, guest, slot["id"], 2, pay_id="pay_ref")
    for _ in range(2):
        await _webhook(client, "refund.created", {"payment_id": "pay_ref", "amount": 588000})
    await db_session.rollback()
    booking = await db_session.get(ExperienceBooking, UUID(order["booking"]["id"]))
    payout = await db_session.scalar(select(ExperiencePayout))
    assert booking.status == "refunded" and payout.status == "voided"
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 0


async def test_partial_refund_webhook_is_ignored(client, orders, admin_token, op, db_session):
    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    order = await _paid(client, guest, slot["id"], 2, pay_id="pay_part")
    await _webhook(client, "refund.created", {"payment_id": "pay_part", "amount": 1000})
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, UUID(order["booking"]["id"]))).status == "confirmed"


async def test_unknown_order_in_webhook_is_ignored(client, orders):
    res = await _captured(client, "order_unknown", "pay_unknown")
    assert res.status_code == 200
