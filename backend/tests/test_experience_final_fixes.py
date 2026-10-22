"""Regression tests for the findings of the final whole-branch review."""
import asyncio
import time
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.models.experience import ExperienceBooking, ExperiencePayment, ExperiencePayout, ExperienceSlot
from app.models.user import HostStatus, OperatorStatus, User, UserRole
from app.routers import experience_payouts as payouts_router
from app.services import experience_payments
from app.services.auth import _deserialize_user, _serialize_user
from app.services.refunds import RefundError
from tests.experience_helpers import h, make_operator
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_experience_bookings import (  # noqa: F401  (fixtures and helpers)
    _book, _captured, _guest, _paid, _rates, _setup, _verify, _webhook, orders,
)
from tests.test_payouts import _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


def test_cached_user_keeps_operator_status():
    """With Redis on, get_user_from_token rebuilds the user from the cache: operator_status must survive it."""
    user = User(
        id=uuid4(), email="op@example.com", password_hash="x", full_name="Op", phone=None, role=UserRole.operator,
        host_status=HostStatus.approved, operator_status=OperatorStatus.suspended, is_active=True,
        is_email_verified=True, open_to_connections=False, created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    assert _deserialize_user(_serialize_user(user)).operator_status == OperatorStatus.suspended
    legacy = _serialize_user(user)
    del legacy["operator_status"]  # an entry cached before this field existed
    assert _deserialize_user(legacy).operator_status == OperatorStatus.approved


async def _lost_race_with_failed_refund(client, orders, admin_token, db_session, monkeypatch):
    """Guest B pays for a seat that A took first and the automatic refund fails: money held, booking failed_full."""
    op = await make_operator(client, admin_token, "opfinal@example.com")
    guest_a = await _guest(client, "fa@example.com")
    guest_b = await _guest(client, "fb@example.com")
    eid, slot = await _setup(client, op, admin_token, capacity=1)
    order_a = (await _book(client, guest_a, slot["id"], 1)).json()
    order_b = (await _book(client, guest_b, slot["id"], 1)).json()
    await _verify(client, guest_a, order_a["booking"]["id"], order_a["razorpay_order_id"], "pay_fa")

    def boom(*args, **kwargs):
        raise RefundError("gateway down")

    working_refund = experience_payments.issue_refund
    monkeypatch.setattr(experience_payments, "issue_refund", boom)
    first = await _verify(client, guest_b, order_b["booking"]["id"], order_b["razorpay_order_id"], "pay_fb")
    monkeypatch.setattr(experience_payments, "issue_refund", working_refund)  # the gateway is back
    return guest_b, order_b, first, slot


async def test_failed_auto_refund_can_be_refunded_by_admin(client, orders, fake_razorpay, admin_token, db_session, monkeypatch):
    guest_b, order_b, first, slot = await _lost_race_with_failed_refund(client, orders, admin_token, db_session, monkeypatch)
    assert first.status_code == 409
    assert "was refunded" not in first.json()["detail"]  # we must not claim a refund that did not happen
    booking_id = order_b["booking"]["id"]
    res = await client.post(f"/admin/experience-bookings/{booking_id}/refund", headers=h(admin_token))
    assert res.status_code == 200, res.text
    assert fake_razorpay == [("pay_fb", {"amount": 294000, "speed": "normal"})]
    again = await client.post(f"/admin/experience-bookings/{booking_id}/refund", headers=h(admin_token))
    assert again.status_code == 200 and len(fake_razorpay) == 1  # idempotent: the gateway is not asked twice
    await db_session.rollback()
    payment = await db_session.scalar(select(ExperiencePayment).where(ExperiencePayment.booking_id == UUID(booking_id)))
    assert payment.status == "refunded"
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 1  # A's seat only; nothing released
    assert len((await db_session.execute(select(ExperiencePayout))).scalars().all()) == 1


async def test_replay_after_failed_auto_refund_still_reports_the_lost_seat(client, orders, admin_token, db_session, monkeypatch):
    guest_b, order_b, first, slot = await _lost_race_with_failed_refund(client, orders, admin_token, db_session, monkeypatch)
    assert first.status_code == 409
    again = await _verify(client, guest_b, order_b["booking"]["id"], order_b["razorpay_order_id"], "pay_fb")
    assert again.status_code == 409  # not a 200 with a failed_full voucher
    await _captured(client, order_b["razorpay_order_id"], "pay_fb")  # a replayed webhook changes nothing either
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, UUID(order_b["booking"]["id"]))).status == "failed_full"
    assert len((await db_session.execute(select(ExperiencePayout))).scalars().all()) == 1


async def test_refund_webhook_racing_the_admin_refund_releases_seats_once(
    client, orders, fake_razorpay, admin_token, db_session, monkeypatch
):
    op = await make_operator(client, admin_token, "oprace@example.com")
    guest_a = await _guest(client, "ra@example.com")
    guest_b = await _guest(client, "rb@example.com")
    eid, slot = await _setup(client, op, admin_token, capacity=4)
    first = (await _paid(client, guest_a, slot["id"], 1, pay_id="pay_ra"))["booking"]["id"]
    await _paid(client, guest_b, slot["id"], 1, pay_id="pay_rb")

    def slow_refund(*args, **kwargs):
        time.sleep(0.6)  # the gateway call: a wide window in which the gateway's refund.created webhook arrives

    monkeypatch.setattr(payouts_router, "issue_refund", slow_refund)

    async def admin_refund():
        return await client.post(f"/admin/experience-bookings/{first}/refund", headers=h(admin_token))

    async def gateway_webhook():
        await asyncio.sleep(0.2)
        return await _webhook(client, "refund.created", {"payment_id": "pay_ra", "amount": 294000})

    admin_res, hook_res = await asyncio.gather(admin_refund(), gateway_webhook())
    assert admin_res.status_code == 200 and hook_res.status_code == 200
    await db_session.rollback()
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 1  # only B's seat is left
    payouts = (await db_session.execute(select(ExperiencePayout).order_by(ExperiencePayout.created_at))).scalars().all()
    assert sorted(p.status for p in payouts) == ["owed", "voided"]
