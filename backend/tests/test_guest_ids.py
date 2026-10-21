from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.booking import Booking
from app.models.guest_id import GuestIdDocument, RefundDispute
from app.models.payout import Payout
from app.routers import guest_ids
from app.services import private_storage
from app.services.guest_id_retention import purge_expired_guest_ids
from tests.test_cancellation import fake_razorpay  # noqa: F401  (fixture)
from tests.test_host_listings import _create_live_listing, _h, _make_host
from tests.test_host_profile import FakeStorage, PNG
from tests.test_payouts import _book, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(private_storage, "upload_private", fake.upload_private)
    monkeypatch.setattr(private_storage, "signed_url", fake.signed_url)
    monkeypatch.setattr(private_storage, "delete_private", fake.delete_private)
    return fake


@pytest.fixture
def mails(monkeypatch):
    sent: list[tuple[str, dict]] = []

    async def admin(**kw):
        sent.append(("admin", kw))

    async def decision(**kw):
        sent.append(("decision", kw))

    monkeypatch.setattr(guest_ids, "send_admin_dispute_email", admin)
    monkeypatch.setattr(guest_ids, "send_dispute_decision_email", decision)
    return sent


def _day(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


async def _hosted_booking(client, admin_token, user_token, db_session, start=60, order="order_g"):
    """A paid booking on a listing owned by a real (non-admin) host. Returns (host_token, booking)."""
    host = await _make_host(client, admin_token, "idhost@example.com")
    pid = await _create_live_listing(client, host, admin_token)
    booking = await _book(client, user_token, pid, check_in=_day(start), check_out=_day(start + 3))
    assert (await _pay(client, db_session, user_token, booking, order=order, pay_id="pay_" + order)).status_code == 200
    return host, booking


async def _upload_id(client, token, booking_id, doc_type="aadhaar"):
    return await client.post(
        f"/bookings/{booking_id}/guest-id", headers=_h(token), data={"doc_type": doc_type},
        files={"file": ("id.png", PNG, "image/png")},
    )


async def test_guest_uploads_id_for_own_paid_booking(client, admin_token, user_token, db_session):
    _, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    res = await _upload_id(client, user_token, booking["id"])
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "pending"
    assert (await client.get(f"/bookings/{booking['id']}/guest-id", headers=_h(user_token))).json()["status"] == "pending"
    mine = (await client.get(f"/bookings/{booking['id']}", headers=_h(user_token))).json()
    assert mine["guest_id_status"] == "pending"
    bad = await client.post(
        f"/bookings/{booking['id']}/guest-id", headers=_h(user_token), data={"doc_type": "selfie"},
        files={"file": ("id.png", PNG, "image/png")},
    )
    assert bad.status_code == 422


async def test_unpaid_booking_cannot_upload_id(client, admin_token, user_token):
    host = await _make_host(client, admin_token, "idhost@example.com")
    pid = await _create_live_listing(client, host, admin_token)
    booking = await _book(client, user_token, pid, check_in=_day(60), check_out=_day(63))
    assert (await _upload_id(client, user_token, booking["id"])).status_code == 409


async def test_other_guest_cannot_upload_or_view(client, admin_token, user_token, db_session):
    _, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    other = (await client.post(
        "/auth/register", json={"email": "other@example.com", "password": "OtherPass123!", "full_name": "Other"}
    )).json()["access_token"]
    assert (await _upload_id(client, other, booking["id"])).status_code == 403
    assert (await client.get(f"/bookings/{booking['id']}/guest-id", headers=_h(other))).status_code == 403


async def test_host_of_property_views_signed_url_other_host_403(client, admin_token, user_token, db_session):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    other_host = await _make_host(client, admin_token, "nosy@example.com")
    ok = await client.get(f"/host/bookings/{booking['id']}/guest-id", headers=_h(host))
    assert ok.status_code == 200 and ok.json()["signed_url"].endswith("?exp=300")
    denied = await client.get(f"/host/bookings/{booking['id']}/guest-id", headers=_h(other_host))
    assert denied.status_code == 403 and "signed_url" not in denied.text
    assert (await client.get(f"/host/bookings/{booking['id']}/guest-id", headers=_h(user_token))).status_code == 403
    assert (await client.post(f"/host/bookings/{booking['id']}/guest-id/approve", headers=_h(other_host))).status_code == 403


async def test_host_approve_sets_booking_status(client, admin_token, user_token, db_session):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    res = await client.post(f"/host/bookings/{booking['id']}/guest-id/approve", headers=_h(host))
    assert res.status_code == 200 and res.json()["status"] == "approved"
    row = await db_session.get(Booking, booking["id"])
    await db_session.refresh(row)
    assert row.guest_id_status == "approved"
    assert (await _upload_id(client, user_token, booking["id"])).status_code == 409  # approved IDs are final


async def test_host_reject_opens_dispute_and_emails_admin(client, admin_token, user_token, db_session, mails):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    res = await client.post(
        f"/host/bookings/{booking['id']}/guest-id/reject", headers=_h(host), json={"reason": "Name does not match"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "rejected"
    assert [m[0] for m in mails] == ["admin"]
    assert mails[0][1]["reason"] == "Name does not match"
    disputes = (await client.get("/admin/disputes?status=open", headers=_h(admin_token))).json()
    assert len(disputes) == 1 and disputes[0]["booking_id"] == booking["id"] and disputes[0]["reason"] == "Name does not match"
    again = await client.post(
        f"/host/bookings/{booking['id']}/guest-id/reject", headers=_h(host), json={"reason": "again"}
    )
    assert again.status_code == 409
    assert len(mails) == 1


async def _reject(client, host, booking_id, reason="Not legitimate"):
    res = await client.post(f"/host/bookings/{booking_id}/guest-id/reject", headers=_h(host), json={"reason": reason})
    assert res.status_code == 200, res.text


async def _open_dispute_id(client, admin_token) -> str:
    return (await client.get("/admin/disputes?status=open", headers=_h(admin_token))).json()[0]["id"]


async def test_admin_refund_decision_refunds_in_full_after_window(
    client, admin_token, user_token, db_session, fake_razorpay, mails
):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    row = await db_session.get(Booking, booking["id"])
    row.created_at = row.created_at - timedelta(days=20)  # far outside the 10-day window
    await db_session.commit()
    await _reject(client, host, booking["id"])
    did = await _open_dispute_id(client, admin_token)

    res = await client.post(f"/admin/disputes/{did}/decide", headers=_h(admin_token), json={"decision": "refund", "note": "Host reported fraud"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "refunded"
    assert fake_razorpay == [("pay_order_g", {"amount": booking["total"] * 100, "speed": "normal"})]

    db_session.expire_all()
    row = await db_session.get(Booking, booking["id"])
    assert row.status.value == "cancelled" and row.payment_status.value == "refunded" and row.refund_amount == booking["total"]
    assert (await db_session.execute(select(Payout))).scalar_one().status == "voided"
    assert "decision" in [m[0] for m in mails]


async def test_deciding_twice_is_409_and_single_refund(client, admin_token, user_token, db_session, fake_razorpay, mails):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    await _reject(client, host, booking["id"])
    did = await _open_dispute_id(client, admin_token)
    body = {"decision": "refund", "note": ""}
    assert (await client.post(f"/admin/disputes/{did}/decide", headers=_h(admin_token), json=body)).status_code == 200
    assert (await client.post(f"/admin/disputes/{did}/decide", headers=_h(admin_token), json=body)).status_code == 409
    assert len(fake_razorpay) == 1
    # only admins decide
    assert (await client.post(f"/admin/disputes/{did}/decide", headers=_h(host), json=body)).status_code == 403


async def test_guest_cancel_then_dispute_refund_issues_single_refund(
    client, admin_token, user_token, db_session, fake_razorpay, mails
):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    assert (await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))).status_code == 200
    assert len(fake_razorpay) == 1
    await _reject(client, host, booking["id"])
    did = await _open_dispute_id(client, admin_token)
    res = await client.post(f"/admin/disputes/{did}/decide", headers=_h(admin_token), json={"decision": "refund", "note": ""})
    assert res.status_code == 200
    assert len(fake_razorpay) == 1  # already refunded: no second gateway call


async def test_dispute_refund_after_late_guest_cancel(client, admin_token, user_token, db_session, fake_razorpay, mails):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    row = await db_session.get(Booking, booking["id"])
    row.created_at = row.created_at - timedelta(days=15)
    await db_session.commit()
    assert (await client.post(f"/bookings/{booking['id']}/cancel", headers=_h(user_token))).json()["refund_amount"] == 0
    assert fake_razorpay == []
    await _reject(client, host, booking["id"])
    did = await _open_dispute_id(client, admin_token)
    await client.post(f"/admin/disputes/{did}/decide", headers=_h(admin_token), json={"decision": "refund", "note": ""})
    assert len(fake_razorpay) == 1  # cancelled without refund earlier: the admin decision still pays the guest back


async def test_dismiss_leaves_booking_untouched(client, admin_token, user_token, db_session, fake_razorpay, mails):
    host, booking = await _hosted_booking(client, admin_token, user_token, db_session)
    await _upload_id(client, user_token, booking["id"])
    await _reject(client, host, booking["id"])
    did = await _open_dispute_id(client, admin_token)
    res = await client.post(f"/admin/disputes/{did}/decide", headers=_h(admin_token), json={"decision": "dismiss", "note": "Looks fine"})
    assert res.status_code == 200 and res.json()["status"] == "dismissed"
    assert fake_razorpay == []
    row = await db_session.get(Booking, booking["id"])
    await db_session.refresh(row)
    assert row.status.value == "confirmed" and row.payment_status.value == "paid"


async def _old_stay_with_id(client, admin_token, user_token, db_session):
    host = await _make_host(client, admin_token, "idhost@example.com")
    pid = await _create_live_listing(client, host, admin_token)
    booking = await _book(client, user_token, pid, check_in=_day(-45), check_out=_day(-42))
    assert (await _pay(client, db_session, user_token, booking, order="order_old", pay_id="pay_old")).status_code == 200
    assert (await _upload_id(client, user_token, booking["id"])).status_code == 201
    return host, booking


async def test_purge_removes_old_ids(client, admin_token, user_token, db_session, storage):
    _, booking = await _old_stay_with_id(client, admin_token, user_token, db_session)
    assert len(storage.files) == 1
    assert await purge_expired_guest_ids(db_session) == 1
    assert storage.files == {}
    doc = (await db_session.execute(select(GuestIdDocument))).scalar_one()
    assert doc.deleted_at is not None


async def test_purge_skips_open_dispute(client, admin_token, user_token, db_session, storage, mails):
    host, booking = await _old_stay_with_id(client, admin_token, user_token, db_session)
    await _reject(client, host, booking["id"])
    assert (await db_session.execute(select(RefundDispute))).scalar_one().status == "open"
    assert await purge_expired_guest_ids(db_session) == 0
    assert len(storage.files) == 1
