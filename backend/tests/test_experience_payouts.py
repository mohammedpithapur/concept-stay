from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.experience import ExperienceBooking, ExperiencePayout, ExperienceSlot
from app.models.host_profile import HostProfile
from app.models.user import User
from app.routers import experience_payouts as payouts_router
from app.services.refunds import RefundError
from tests.experience_helpers import h, make_operator
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_experience_bookings import _guest, _paid, _rates, _setup, orders  # noqa: F401  (fixtures and helpers)
from tests.test_payouts import SECRET, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def op(client, admin_token):
    return await make_operator(client, admin_token, "oppay@example.com")


async def _operator_id(db, email="oppay@example.com") -> UUID:
    return await db.scalar(select(User.id).where(User.email == email))


async def _verify_kyc(db, user_id):
    db.add(HostProfile(user_id=user_id, kyc_status="verified"))
    await db.commit()


async def _paid_booking(client, orders, admin_token, op, db_session, pay_id="pay_1", party=2, capacity=4):
    guest = await _guest(client, f"g{pay_id}@example.com")
    eid, slot = await _setup(client, op, admin_token, capacity=capacity)
    order = await _paid(client, guest, slot["id"], party, pay_id=pay_id)
    return guest, eid, slot, order["booking"]["id"]


async def _payout_id(db, booking_id):
    return await db.scalar(select(ExperiencePayout.id).where(ExperiencePayout.booking_id == UUID(booking_id)))


async def test_mark_paid_blocked_until_kyc_verified(client, orders, admin_token, op, db_session):
    _, _, _, booking_id = await _paid_booking(client, orders, admin_token, op, db_session)
    pid = await _payout_id(db_session, booking_id)
    listing = (await client.get("/admin/experience-payouts?status=owed", headers=h(admin_token))).json()
    assert [(p["id"], p["operator_kyc_status"]) for p in listing] == [(str(pid), "incomplete")]
    res = await client.post(f"/admin/experience-payouts/{pid}/mark-paid", headers=h(admin_token), json={"reference": "UTR1"})
    assert res.status_code == 409 and "KYC" in res.json()["detail"]


async def test_mark_paid_after_verify_records_reference(client, orders, admin_token, op, db_session):
    _, _, _, booking_id = await _paid_booking(client, orders, admin_token, op, db_session)
    await _verify_kyc(db_session, await _operator_id(db_session))
    pid = await _payout_id(db_session, booking_id)
    res = await client.post(f"/admin/experience-payouts/{pid}/mark-paid", headers=h(admin_token), json={"reference": "UTR42"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "paid" and res.json()["reference"] == "UTR42" and res.json()["operator_amount"] == 4250
    again = await client.post(f"/admin/experience-payouts/{pid}/mark-paid", headers=h(admin_token), json={"reference": "UTR43"})
    assert again.status_code == 409
    assert (await client.post(f"/admin/experience-payouts/{pid}/mark-paid", headers=h(op), json={"reference": "x"})).status_code == 403


async def test_operator_sees_only_own_payouts_and_bookings(client, orders, admin_token, op, db_session):
    other = await make_operator(client, admin_token, "opother@example.com")
    await _paid_booking(client, orders, admin_token, op, db_session, pay_id="pay_mine")
    await _paid_booking(client, orders, admin_token, other, db_session, pay_id="pay_theirs")
    mine = (await client.get("/operator/payouts", headers=h(op))).json()
    assert len(mine) == 1 and mine[0]["operator_amount"] == 4250
    bookings = (await client.get("/operator/bookings", headers=h(op))).json()
    assert len(bookings) == 1
    assert len((await client.get("/operator/bookings", headers=h(other))).json()) == 1
    assert (await client.get("/operator/payouts", headers=h(await _guest(client, "nobody@example.com")))).status_code == 403


async def test_operator_booking_list_shows_first_name_and_phone_only(client, orders, admin_token, op, db_session):
    guest, _, _, booking_id = await _paid_booking(client, orders, admin_token, op, db_session)
    user = await db_session.scalar(select(User).where(User.email == "gpay_1@example.com"))
    user.full_name = "Asha Verma"
    user.phone = "9876543210"
    await db_session.commit()
    row = (await client.get("/operator/bookings", headers=h(op))).json()[0]
    assert set(row) == {"id", "experience_title", "starts_at", "party_size", "voucher_code", "guest_first_name", "guest_phone", "status"}
    assert row["guest_first_name"] == "Asha" and row["guest_phone"] == "9876543210" and row["party_size"] == 2


async def test_operator_booking_list_hides_unpaid_bookings(client, orders, admin_token, op):
    from tests.test_experience_bookings import _book

    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    await _book(client, guest, slot["id"], 1)  # pending, never paid
    assert (await client.get("/operator/bookings", headers=h(op))).json() == []


async def test_admin_refund_releases_seats_voids_payout(client, orders, fake_razorpay, admin_token, op, db_session):
    _, _, slot, booking_id = await _paid_booking(client, orders, admin_token, op, db_session)
    res = await client.post(f"/admin/experience-bookings/{booking_id}/refund", headers=h(admin_token))
    assert res.status_code == 200, res.text
    assert res.json() == {"booking_id": booking_id, "status": "refunded", "payout_needs_recovery": False}
    assert fake_razorpay == [("pay_1", {"amount": 588000, "speed": "normal"})]
    await db_session.rollback()
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 0
    assert (await db_session.get(ExperienceBooking, UUID(booking_id))).status == "refunded"
    assert (await db_session.scalar(select(ExperiencePayout))).status == "voided"


async def test_refund_twice_idempotent_no_double_release(client, orders, fake_razorpay, admin_token, op, db_session):
    guest_a, eid, slot, first = await _paid_booking(client, orders, admin_token, op, db_session, pay_id="pay_a", party=1)
    guest_b = await _guest(client, "second@example.com")
    second = await _paid(client, guest_b, slot["id"], 1, pay_id="pay_b")
    await client.post(f"/admin/experience-bookings/{first}/refund", headers=h(admin_token))
    again = await client.post(f"/admin/experience-bookings/{first}/refund", headers=h(admin_token))
    assert again.status_code == 200 and again.json()["status"] == "refunded"
    assert len(fake_razorpay) == 1
    await db_session.rollback()
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 1  # only the second guest's seat remains


async def test_refund_paid_payout_flags_recovery(client, orders, fake_razorpay, admin_token, op, db_session):
    _, _, _, booking_id = await _paid_booking(client, orders, admin_token, op, db_session)
    await _verify_kyc(db_session, await _operator_id(db_session))
    pid = await _payout_id(db_session, booking_id)
    await client.post(f"/admin/experience-payouts/{pid}/mark-paid", headers=h(admin_token), json={"reference": "UTR9"})
    res = await client.post(f"/admin/experience-bookings/{booking_id}/refund", headers=h(admin_token))
    assert res.json()["payout_needs_recovery"] is True
    await db_session.rollback()
    assert (await db_session.scalar(select(ExperiencePayout))).status == "paid"  # left alone for manual recovery


async def test_refund_requires_admin_and_a_paid_booking(client, orders, fake_razorpay, admin_token, op):
    from tests.test_experience_bookings import _book

    guest = await _guest(client)
    eid, slot = await _setup(client, op, admin_token)
    pending = (await _book(client, guest, slot["id"], 1)).json()["booking"]["id"]
    assert (await client.post(f"/admin/experience-bookings/{pending}/refund", headers=h(op))).status_code == 403
    assert (await client.post(f"/admin/experience-bookings/{pending}/refund", headers=h(guest))).status_code == 403
    assert (await client.post(f"/admin/experience-bookings/{pending}/refund", headers=h(admin_token))).status_code == 409
    assert fake_razorpay == []


async def test_refund_gateway_failure_changes_nothing(client, orders, admin_token, op, db_session, monkeypatch):
    _, _, slot, booking_id = await _paid_booking(client, orders, admin_token, op, db_session)

    def boom(*args, **kwargs):
        raise RefundError("gateway down")

    monkeypatch.setattr(payouts_router, "issue_refund", boom)
    res = await client.post(f"/admin/experience-bookings/{booking_id}/refund", headers=h(admin_token))
    assert res.status_code == 502
    await db_session.rollback()
    assert (await db_session.get(ExperienceBooking, UUID(booking_id))).status == "confirmed"
    assert (await db_session.get(ExperienceSlot, UUID(slot["id"]))).seats_booked == 2
