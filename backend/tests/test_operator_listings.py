from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from app.models.experience import ExperienceBooking, ExperienceSlot
from app.models.user import User
from tests.experience_helpers import create_live_experience, experience_payload, h, make_operator

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def op_a(client, admin_token):
    return await make_operator(client, admin_token, "opa@example.com")


@pytest.fixture
async def op_b(client, admin_token):
    return await make_operator(client, admin_token, "opb@example.com")


async def test_create_is_pending_and_hidden(client, op_a):
    res = await client.post("/operator/experiences", headers=h(op_a), json=experience_payload(is_published=True))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["approval_status"] == "pending_review"
    assert body["is_published"] is False
    listing = await client.get("/operator/experiences", headers=h(op_a))
    assert [e["id"] for e in listing.json()] == [body["id"]]


async def test_pending_operator_cannot_create(client, user_token):
    await client.post("/auth/become-operator", headers=h(user_token))
    res = await client.post("/operator/experiences", headers=h(user_token), json=experience_payload())
    assert res.status_code == 403


async def test_operator_cannot_touch_other_operators_listing(client, admin_token, op_a, op_b):
    eid = await create_live_experience(client, op_a, admin_token)
    assert (await client.patch(f"/operator/experiences/{eid}", headers=h(op_b), json={"title": "x"})).status_code == 403
    assert (await client.post(f"/operator/experiences/{eid}/unpublish", headers=h(op_b))).status_code == 403
    assert (await client.get("/operator/experiences", headers=h(op_b))).json() == []


async def test_invalid_category_and_price_rejected(client, op_a):
    for bad in ({"category": "skydiving"}, {"price_per_person": 0}, {"difficulty": "insane"}, {"min_age": -1},
                {"images": ["u"] * 11}, {"duration_minutes": 0}):
        res = await client.post("/operator/experiences", headers=h(op_a), json=experience_payload(**bad))
        assert res.status_code == 422, bad


async def test_edit_approved_goes_to_pending_changes_live_unchanged(client, admin_token, op_a):
    eid = await create_live_experience(client, op_a, admin_token)
    res = await client.patch(f"/operator/experiences/{eid}", headers=h(op_a), json={"price_per_person": 3000})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["price_per_person"] == 2500  # live data keeps the last approved value
    assert body["pending_changes"] == {"price_per_person": 3000}
    assert body["approval_status"] == "approved" and body["is_published"] is True
    queue = await client.get("/admin/experience-review-queue", headers=h(admin_token))
    assert [e["id"] for e in queue.json()] == [eid]
    approve = await client.post(f"/admin/experiences/{eid}/approve", headers=h(admin_token))
    assert approve.json()["price_per_person"] == 3000
    assert approve.json()["pending_changes"] is None


async def test_approve_publishes_first_time_and_reject_stores_reason(client, admin_token, op_a):
    created = (await client.post("/operator/experiences", headers=h(op_a), json=experience_payload())).json()
    rejected = await client.post(
        f"/admin/experiences/{created['id']}/reject", headers=h(admin_token), json={"reason": "Photos too dark"}
    )
    assert rejected.status_code == 200
    assert rejected.json()["approval_status"] == "rejected"
    assert rejected.json()["rejection_reason"] == "Photos too dark"
    fixed = await client.patch(f"/operator/experiences/{created['id']}", headers=h(op_a), json={"title": "Better photos trek"})
    assert fixed.json()["approval_status"] == "pending_review"
    assert fixed.json()["rejection_reason"] is None
    approved = await client.post(f"/admin/experiences/{created['id']}/approve", headers=h(admin_token))
    assert approved.json()["approval_status"] == "approved"
    assert approved.json()["is_published"] is True


async def test_rejecting_an_edit_keeps_listing_live(client, admin_token, op_a):
    eid = await create_live_experience(client, op_a, admin_token)
    await client.patch(f"/operator/experiences/{eid}", headers=h(op_a), json={"price_per_person": 9999})
    res = await client.post(f"/admin/experiences/{eid}/reject", headers=h(admin_token), json={"reason": "Too pricey"})
    assert res.json()["approval_status"] == "approved"
    assert res.json()["is_published"] is True
    assert res.json()["price_per_person"] == 2500
    assert res.json()["pending_changes"] is None


async def test_non_admin_cannot_review(client, admin_token, op_a):
    created = (await client.post("/operator/experiences", headers=h(op_a), json=experience_payload())).json()
    assert (await client.post(f"/admin/experiences/{created['id']}/approve", headers=h(op_a))).status_code == 403
    assert (await client.get("/admin/experience-review-queue", headers=h(op_a))).status_code == 403


async def test_unpublish_hides_listing_but_keeps_confirmed_bookings(client, admin_token, op_a, db_session):
    eid = await create_live_experience(client, op_a, admin_token)
    guest = User(email="g@example.com", password_hash="x", full_name="G")
    db_session.add(guest)
    await db_session.flush()
    slot = ExperienceSlot(
        experience_id=UUID(eid), starts_at=datetime.now(timezone.utc) + timedelta(days=5), capacity=4, seats_booked=2
    )
    db_session.add(slot)
    await db_session.flush()
    booking = ExperienceBooking(
        experience_id=UUID(eid), slot_id=slot.id, guest_id=guest.id, party_size=2, price_per_person=2500, value=5000,
        service_fee=250, taxes=630, total=5880, commission_percent=15, commission=750, charged_minor=588000,
        voucher_code="UNPUBLISH1", status="confirmed",
    )
    db_session.add(booking)
    await db_session.commit()

    res = await client.post(f"/operator/experiences/{eid}/unpublish", headers=h(op_a))
    assert res.status_code == 200 and res.json()["is_published"] is False
    await db_session.refresh(booking)
    assert booking.status == "confirmed"
    assert (await client.post(f"/admin/experiences/{eid}/publish", headers=h(op_a))).status_code == 403
    again = await client.post(f"/admin/experiences/{eid}/publish", headers=h(admin_token))
    assert again.json()["is_published"] is True
    assert (await client.post(f"/admin/experiences/{eid}/unpublish", headers=h(admin_token))).json()["is_published"] is False
