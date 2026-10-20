import hashlib
import hmac
import json
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.models.booking import Booking
from app.models.payment import Payment, RazorpayPaymentStatus
from app.models.payout import Payout
from app.services.booking import calculate_pricing
from app.services.payouts import create_payout_for_booking
from tests.test_host_listings import _create_live_listing, _h, _make_host
from tests.test_properties import _property_payload

pytestmark = pytest.mark.asyncio

SECRET = "testsecret"


@pytest.fixture(autouse=True)
def _razorpay_secret(monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", SECRET)
    monkeypatch.setattr(settings, "PLATFORM_COMMISSION_PERCENT", 15)
    monkeypatch.setattr(settings, "GUEST_SERVICE_FEE_PERCENT", 5)
    monkeypatch.setattr(settings, "TAX_PERCENT", 12)


def _prop(**kw):
    base = dict(price_per_night=5000, cleaning_fee=800, extra_guest_charge_per_night=0, base_guests=2,
                pet_charge_per_night=0)
    base.update(kw)
    return SimpleNamespace(**base)


def test_pricing_breakdown_three_nights():
    p = calculate_pricing(_prop(), date(2031, 1, 1), date(2031, 1, 4), pets=0, guests=2)
    assert p["nights"] == 3
    assert p["base_price"] == 15000
    assert p["extra_guest_charge"] == 0
    assert p["cleaning_fee"] == 800
    assert p["service_fee"] == 750  # 5% of stay value
    assert p["subtotal"] == 16550  # stay + cleaning + service fee
    assert p["taxes"] == 1986  # 12% of everything the guest is charged
    assert p["total"] == 18536


def test_pricing_extra_guests_and_pets_taxed_correctly():
    p = calculate_pricing(
        _prop(extra_guest_charge_per_night=500, pet_charge_per_night=200),
        date(2031, 1, 1), date(2031, 1, 3), pets=1, guests=4,
    )
    assert p["extra_guest_charge"] == 2 * 2 * 500  # 2 extra guests x 2 nights x 500
    assert p["pet_charge"] == 400
    stay_value = p["base_price"] + p["extra_guest_charge"]
    assert p["service_fee"] == round(stay_value * 0.05)
    assert p["taxes"] == 1656 == round((stay_value + 400 + 800 + p["service_fee"]) * 0.12)
    assert p["total"] == 15456


async def _listing(client, admin_headers, **kw) -> str:
    res = await client.post("/admin/properties", headers=admin_headers, json=_property_payload(kw))
    assert res.status_code == 200, res.text
    return res.json()["id"]


async def _book(client, token, pid, check_in="2031-05-01", check_out="2031-05-04", guests=2) -> dict:
    res = await client.post(
        "/bookings", headers=_h(token),
        json={"property_id": pid, "check_in": check_in, "check_out": check_out, "guests": guests},
    )
    assert res.status_code == 200, res.text
    return res.json()


async def _pay(client, db_session, token, booking, order="order_1", pay_id="pay_1"):
    db_session.add(Payment(booking_id=booking["id"], razorpay_order_id=order, amount=booking["total"] * 100,
                           status=RazorpayPaymentStatus.created))
    await db_session.commit()
    sig = hmac.new(SECRET.encode(), f"{order}|{pay_id}".encode(), hashlib.sha256).hexdigest()
    return await client.post(
        "/payments/verify", headers=_h(token),
        json={"razorpay_order_id": order, "razorpay_payment_id": pay_id, "razorpay_signature": sig},
    )


async def test_booking_stores_breakdown_and_matches_quote(client, admin_headers, user_token):
    pid = await _listing(client, admin_headers)
    quote = await client.get(f"/properties/{pid}/quote?check_in=2031-05-01&check_out=2031-05-04&guests=2")
    assert quote.status_code == 200, quote.text
    booking = await _book(client, user_token, pid)
    q = quote.json()
    assert booking["total"] == q["total"] == 18536
    assert booking["taxes"] == q["taxes"] == 1986
    assert booking["service_fee"] == q["service_fee"] == 750
    assert booking["extra_guest_charge"] == 0
    assert len(q["nightly_rates"]) == 3


async def test_verify_creates_single_payout(client, admin_headers, admin_token, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid)
    res = await _pay(client, db_session, user_token, booking)
    assert res.status_code == 200, res.text

    rows = (await db_session.execute(select(Payout))).scalars().all()
    assert len(rows) == 1
    p = rows[0]
    assert (p.gross_amount, p.commission, p.fees, p.taxes, p.host_amount) == (18536, 2250, 750, 1986, 13550)
    assert p.gross_amount == p.host_amount + p.commission + p.fees + p.taxes
    assert p.status == "owed"

    # second verify call is a no-op and must not add a second ledger row
    again = await client.post(
        "/payments/verify", headers=_h(user_token),
        json={"razorpay_order_id": "order_1", "razorpay_payment_id": "pay_1",
              "razorpay_signature": hmac.new(SECRET.encode(), b"order_1|pay_1", hashlib.sha256).hexdigest()},
    )
    assert again.status_code == 200
    assert (await db_session.scalar(select(func.count()).select_from(Payout))) == 1


async def test_create_payout_is_idempotent(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid)
    await _pay(client, db_session, user_token, booking)
    b = await db_session.get(Booking, booking["id"])
    first = await create_payout_for_booking(db_session, b)
    second = await create_payout_for_booking(db_session, b)
    await db_session.commit()
    assert first.id == second.id
    assert (await db_session.scalar(select(func.count()).select_from(Payout))) == 1


async def test_webhook_then_verify_yields_one_payout(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid)
    db_session.add(Payment(booking_id=booking["id"], razorpay_order_id="order_w", amount=booking["total"] * 100,
                           status=RazorpayPaymentStatus.created))
    await db_session.commit()
    body = json.dumps({"event": "payment.captured",
                       "payload": {"payment": {"entity": {"order_id": "order_w", "id": "pay_w"}}}}).encode()
    sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    wh = await client.post("/payments/webhook", content=body, headers={"X-Razorpay-Signature": sig})
    assert wh.status_code == 200
    assert (await db_session.scalar(select(func.count()).select_from(Payout))) == 1
    vsig = hmac.new(SECRET.encode(), b"order_w|pay_w", hashlib.sha256).hexdigest()
    ver = await client.post(
        "/payments/verify", headers=_h(user_token),
        json={"razorpay_order_id": "order_w", "razorpay_payment_id": "pay_w", "razorpay_signature": vsig},
    )
    assert ver.status_code == 200
    assert (await db_session.scalar(select(func.count()).select_from(Payout))) == 1


async def test_payout_never_negative_at_full_commission(client, admin_headers, user_token, db_session, monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_COMMISSION_PERCENT", 100)
    pid = await _listing(client, admin_headers, price_per_night=1000, cleaning_fee=0)
    booking = await _book(client, user_token, pid)
    await _pay(client, db_session, user_token, booking)
    p = (await db_session.execute(select(Payout))).scalar_one()
    assert p.host_amount == 0
    assert p.commission == 3000


async def test_admin_payout_listing_and_mark_paid(client, admin_headers, admin_token, user_token, db_session):
    pid = await _listing(client, admin_headers)
    await _pay(client, db_session, user_token, await _book(client, user_token, pid))

    listing = await client.get("/admin/payouts?status=owed", headers=admin_headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    payout_id = listing.json()[0]["id"]

    forbidden = await client.post(f"/admin/payouts/{payout_id}/mark-paid", headers=_h(user_token),
                                  json={"reference": "UTR123"})
    assert forbidden.status_code == 403

    ok = await client.post(f"/admin/payouts/{payout_id}/mark-paid", headers=admin_headers,
                           json={"reference": "UTR123"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "paid" and ok.json()["reference"] == "UTR123" and ok.json()["paid_at"]
    again = await client.post(f"/admin/payouts/{payout_id}/mark-paid", headers=admin_headers,
                              json={"reference": "UTR999"})
    assert again.status_code == 409
    assert (await client.get("/admin/payouts?status=owed", headers=admin_headers)).json() == []


async def test_host_sees_only_own_payouts(client, admin_token, user_token, db_session):
    host_a = await _make_host(client, admin_token, "payouta@example.com")
    host_b = await _make_host(client, admin_token, "payoutb@example.com")
    pid_a = await _create_live_listing(client, host_a, admin_token)
    pid_b = await _create_live_listing(client, host_b, admin_token)
    await _pay(client, db_session, user_token, await _book(client, user_token, pid_a), order="oa", pay_id="pa")
    await _pay(client, db_session, user_token, await _book(client, user_token, pid_b), order="ob", pay_id="pb")

    mine_a = (await client.get("/host/payouts", headers=_h(host_a))).json()
    mine_b = (await client.get("/host/payouts", headers=_h(host_b))).json()
    assert len(mine_a) == 1 and len(mine_b) == 1
    assert mine_a[0]["id"] != mine_b[0]["id"]
    assert mine_a[0]["host_amount"] == 13550
