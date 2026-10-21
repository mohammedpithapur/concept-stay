import hashlib
import hmac
import json
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.booking import Booking
from app.models.payment import Payment
from app.models.payout import Payout
from app.routers import payments as payments_router
from app.services.fx import to_inr, to_minor
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_host_listings import _h
from tests.test_payouts import SECRET, _listing, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio

USD_RATE = "0.012"


def _day(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


@pytest.fixture
def orders(monkeypatch):
    """Fake Razorpay order API: records what the server asks the gateway to charge."""
    created: list[dict] = []

    class _Order:
        def create(self, payload):
            created.append(payload)
            return {"id": f"order_{len(created)}"}

    monkeypatch.setattr(payments_router, "_get_razorpay_client", lambda: SimpleNamespace(order=_Order()))
    monkeypatch.setattr(payments_router.settings, "RAZORPAY_KEY_ID", "rzp_test")
    monkeypatch.setattr(payments_router.settings, "RAZORPAY_KEY_SECRET", SECRET)
    return created


async def _set_rate(client, admin_token, currency="USD", rate=USD_RATE):
    res = await client.put(f"/admin/fx-rates/{currency}", headers=_h(admin_token), json={"rate_per_inr": rate})
    assert res.status_code == 200, res.text


async def _book(client, token, pid, currency=None, start=60):
    body = {"property_id": pid, "check_in": _day(start), "check_out": _day(start + 3), "guests": 2}
    if currency:
        body["currency"] = currency
    return await client.post("/bookings", headers=_h(token), json=body)


async def _pay_through_api(client, token, booking_id, pay_id="pay_intl"):
    order = (await client.post("/payments/create-order", headers=_h(token), json={"booking_id": booking_id})).json()
    sig = hmac.new(SECRET.encode(), f"{order['razorpay_order_id']}|{pay_id}".encode(), hashlib.sha256).hexdigest()
    res = await client.post(
        "/payments/verify", headers=_h(token),
        json={"razorpay_order_id": order["razorpay_order_id"], "razorpay_payment_id": pay_id, "razorpay_signature": sig},
    )
    assert res.status_code == 200, res.text
    return order


def test_to_minor_and_back_round_trip():
    assert to_minor(5000, Decimal("1")) == 500000
    assert to_inr(500000, Decimal("1")) == 5000
    assert to_minor(5000, Decimal(USD_RATE)) == 6000
    assert to_inr(6000, Decimal(USD_RATE)) == 5000
    assert to_minor(1, Decimal("0.005")) == 1  # 0.5 cents rounds half up
    for inr in (1, 999, 18536, 123457):
        for rate in (Decimal("0.012"), Decimal("0.0109"), Decimal("0.0123456")):
            assert to_inr(to_minor(inr, rate), rate) == inr


async def test_unsupported_currency_is_422(client, admin_headers, admin_token, user_token):
    pid = await _listing(client, admin_headers)
    assert (await _book(client, user_token, pid, currency="XYZ")).status_code == 422
    assert (await _book(client, user_token, pid, currency="USD")).status_code == 422  # supported, but no rate set yet
    quote = await client.get(f"/properties/{pid}/quote?check_in={_day(60)}&check_out={_day(63)}&guests=2&currency=XYZ")
    assert quote.status_code == 422


async def test_inr_booking_unchanged(client, admin_headers, user_token, orders, db_session):
    pid = await _listing(client, admin_headers)
    booking = (await _book(client, user_token, pid)).json()
    assert booking["currency"] == "INR" and booking["total"] == 18536 and booking["charged_minor"] == 1853600
    order = (await client.post("/payments/create-order", headers=_h(user_token), json={"booking_id": booking["id"]})).json()
    assert order["amount"] == booking["total"] * 100 and order["currency"] == "INR"
    assert orders[0]["amount"] == 1853600 and orders[0]["currency"] == "INR"


async def test_usd_order_uses_locked_rate_and_currency(client, admin_headers, admin_token, user_token, orders):
    await _set_rate(client, admin_token)
    pid = await _listing(client, admin_headers)
    quote = (await client.get(f"/properties/{pid}/quote?check_in={_day(60)}&check_out={_day(63)}&guests=2&currency=USD")).json()
    assert quote["total"] == 18536 and quote["charged"] == {"currency": "USD", "amount_minor": 22243}

    booking = (await _book(client, user_token, pid, currency="USD")).json()
    assert booking["total"] == 18536 and booking["currency"] == "USD" and booking["charged_minor"] == 22243
    order = (await client.post("/payments/create-order", headers=_h(user_token), json={"booking_id": booking["id"]})).json()
    assert (order["amount"], order["currency"]) == (22243, "USD")
    assert (orders[0]["amount"], orders[0]["currency"]) == (22243, "USD")


async def test_rate_change_after_order_does_not_change_charge(client, admin_headers, admin_token, user_token, orders):
    await _set_rate(client, admin_token)
    pid = await _listing(client, admin_headers)
    booking = (await _book(client, user_token, pid, currency="USD")).json()
    first = (await client.post("/payments/create-order", headers=_h(user_token), json={"booking_id": booking["id"]})).json()
    await _set_rate(client, admin_token, rate="0.02")
    again = (await client.post("/payments/create-order", headers=_h(user_token), json={"booking_id": booking["id"]})).json()
    assert again["amount"] == first["amount"] == 22243 and len(orders) == 1
    mine = (await client.get(f"/bookings/{booking['id']}", headers=_h(user_token))).json()
    assert mine["charged_minor"] == 22243


async def test_full_refund_equals_captured_amount_exactly(
    client, admin_headers, admin_token, user_token, orders, fake_razorpay, db_session
):
    await _set_rate(client, admin_token)
    pid = await _listing(client, admin_headers)
    booking = (await _book(client, user_token, pid, currency="USD")).json()
    await _pay_through_api(client, user_token, booking["id"])
    res = await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))
    assert res.status_code == 200, res.text
    assert res.json()["refund_amount"] == 18536
    payment = (await db_session.execute(select(Payment))).scalar_one()
    assert fake_razorpay == [("pay_intl", {"amount": payment.amount, "speed": "normal"})]
    assert payment.amount == 22243  # not 1853600: the refund is in the charged currency, to the cent


async def test_partial_refund_webhook_converts_back_to_inr(
    client, admin_headers, admin_token, user_token, orders, db_session
):
    await _set_rate(client, admin_token)
    pid = await _listing(client, admin_headers)
    booking = (await _book(client, user_token, pid, currency="USD")).json()
    await _pay_through_api(client, user_token, booking["id"], pay_id="pay_wh")

    async def webhook(minor: int):
        body = json.dumps({"event": "refund.created", "payload": {"refund": {"entity": {"payment_id": "pay_wh", "amount": minor}}}}).encode()
        sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        return await client.post("/payments/webhook", content=body, headers={"X-Razorpay-Signature": sig})

    assert (await webhook(11121)).status_code == 200  # about half of $222.43
    db_session.expire_all()
    row = await db_session.get(Booking, booking["id"])
    assert row.refund_amount == to_inr(11121, Decimal(USD_RATE)) == 9268
    assert 0 < row.refund_amount < row.total
    payout = (await db_session.execute(select(Payout))).scalar_one()
    assert payout.status == "owed" and 0 < payout.host_amount < 13550

    assert (await webhook(22243)).status_code == 200  # the rest: the captured amount, no rounding drift
    db_session.expire_all()
    row = await db_session.get(Booking, booking["id"])
    assert row.refund_amount == row.total == 18536


async def test_admin_only_can_set_rates(client, admin_token, user_token):
    denied = await client.put("/admin/fx-rates/USD", headers=_h(user_token), json={"rate_per_inr": USD_RATE})
    assert denied.status_code == 403
    await _set_rate(client, admin_token)
    assert (await client.put("/admin/fx-rates/XYZ", headers=_h(admin_token), json={"rate_per_inr": "1"})).status_code == 422
    assert (await client.put("/admin/fx-rates/INR", headers=_h(admin_token), json={"rate_per_inr": "2"})).status_code == 422
    assert (await client.put("/admin/fx-rates/USD", headers=_h(admin_token), json={"rate_per_inr": "0"})).status_code == 422
    public = (await client.get("/fx-rates")).json()
    assert public["base"] == "INR" and "USD" in public["supported"]
    assert Decimal(str(public["rates"]["USD"])) == Decimal(USD_RATE) and public["rates"]["INR"] == 1
