from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.experience import ExperienceBooking, ExperienceSlot
from app.models.user import User
from tests.experience_helpers import (
    add_slot, create_live_experience, experience_payload, h, in_hours, make_operator,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def op_a(client, admin_token):
    return await make_operator(client, admin_token, "opa@example.com")


@pytest.fixture
async def op_b(client, admin_token):
    return await make_operator(client, admin_token, "opb@example.com")


async def _booking_on(db, experience_id, slot_id, status, code):
    guest = (await db.execute(select(User).where(User.email == "slotguest@example.com"))).scalar_one_or_none()
    if guest is None:
        guest = User(email="slotguest@example.com", password_hash="x", full_name="Guest")
        db.add(guest)
        await db.flush()
    booking = ExperienceBooking(
        experience_id=UUID(experience_id), slot_id=UUID(slot_id), guest_id=guest.id, party_size=1, price_per_person=2500,
        value=2500, service_fee=125, taxes=315, total=2940, commission_percent=15, commission=375,
        charged_minor=294000, voucher_code=code, status=status,
    )
    db.add(booking)
    await db.commit()
    return booking


async def test_add_slot_in_past_rejected(client, admin_token, op_a):
    eid = await create_live_experience(client, op_a, admin_token)
    past = await client.post(
        f"/operator/experiences/{eid}/slots", headers=h(op_a), json={"starts_at": in_hours(-2), "capacity": 4}
    )
    assert past.status_code == 422
    naive = datetime.now() + timedelta(days=2)
    res = await client.post(
        f"/operator/experiences/{eid}/slots", headers=h(op_a), json={"starts_at": naive.replace(tzinfo=None).isoformat(), "capacity": 4}
    )
    assert res.status_code == 422


async def test_add_slot_returns_seats_left_and_works_on_pending_listing(client, op_a):
    created = (await client.post("/operator/experiences", headers=h(op_a), json=experience_payload())).json()
    slot = await add_slot(client, op_a, created["id"], capacity=6)
    assert slot["capacity"] == 6 and slot["seats_booked"] == 0 and slot["seats_left"] == 6


async def test_capacity_cannot_drop_below_booked(client, admin_token, op_a, db_session):
    eid = await create_live_experience(client, op_a, admin_token)
    slot = await add_slot(client, op_a, eid, capacity=5)
    row = await db_session.get(ExperienceSlot, UUID(slot["id"]))
    row.seats_booked = 3
    await db_session.commit()
    low = await client.patch(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_a), json={"capacity": 2})
    assert low.status_code == 409
    ok = await client.patch(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_a), json={"capacity": 3})
    assert ok.status_code == 200 and ok.json()["seats_left"] == 0


async def test_delete_slot_with_pending_booking_409(client, admin_token, op_a, db_session):
    eid = await create_live_experience(client, op_a, admin_token)
    slot = await add_slot(client, op_a, eid)
    await _booking_on(db_session, eid, slot["id"], "pending", "PENDINGDEL")
    res = await client.delete(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_a))
    assert res.status_code == 409
    assert await db_session.get(ExperienceSlot, UUID(slot["id"])) is not None


async def test_delete_slot_with_confirmed_booking_409(client, admin_token, op_a, db_session):
    eid = await create_live_experience(client, op_a, admin_token)
    slot = await add_slot(client, op_a, eid)
    await _booking_on(db_session, eid, slot["id"], "confirmed", "CONFIRMDEL")
    assert (await client.delete(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_a))).status_code == 409


async def test_delete_empty_slot_ok(client, admin_token, op_a, db_session):
    eid = await create_live_experience(client, op_a, admin_token)
    slot = await add_slot(client, op_a, eid)
    assert (await client.delete(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_a))).status_code == 204
    assert await db_session.get(ExperienceSlot, UUID(slot["id"])) is None


async def test_other_operator_cannot_manage_slots(client, admin_token, op_a, op_b):
    eid = await create_live_experience(client, op_a, admin_token)
    slot = await add_slot(client, op_a, eid)
    add = await client.post(f"/operator/experiences/{eid}/slots", headers=h(op_b), json={"starts_at": in_hours(48), "capacity": 2})
    assert add.status_code == 403
    assert (await client.patch(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_b), json={"capacity": 9})).status_code == 403
    assert (await client.delete(f"/operator/experiences/{eid}/slots/{slot['id']}", headers=h(op_b))).status_code == 403


async def test_slot_must_belong_to_the_experience_in_the_path(client, admin_token, op_a):
    first = await create_live_experience(client, op_a, admin_token)
    second = await create_live_experience(client, op_a, admin_token, title="Other")
    slot = await add_slot(client, op_a, first)
    res = await client.delete(f"/operator/experiences/{second}/slots/{slot['id']}", headers=h(op_a))
    assert res.status_code == 404
