from uuid import UUID

import pytest

from app.config import settings
from app.models.experience import ExperienceSlot
from tests.experience_helpers import (
    add_slot, create_live_experience, experience_payload, h, make_operator,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _rates(monkeypatch):
    monkeypatch.setattr(settings, "GUEST_SERVICE_FEE_PERCENT", 5)
    monkeypatch.setattr(settings, "TAX_PERCENT", 12)
    monkeypatch.setattr(settings, "EXPERIENCE_COMMISSION_PERCENT", 15)


@pytest.fixture
async def op(client, admin_token):
    return await make_operator(client, admin_token, "opsearch@example.com")


async def _live_with_slot(client, op, admin_token, hours=72, capacity=4, **overrides):
    eid = await create_live_experience(client, op, admin_token, **overrides)
    slot = await add_slot(client, op, eid, hours=hours, capacity=capacity)
    return eid, slot


async def _ids(client, **params):
    res = await client.get("/experiences", params=params)
    assert res.status_code == 200, res.text
    return [e["id"] for e in res.json()["items"]]


async def test_search_only_shows_approved_published_with_future_slot(client, admin_token, op):
    live, _ = await _live_with_slot(client, op, admin_token)
    await create_live_experience(client, op, admin_token, title="No slots")
    pending = (await client.post("/operator/experiences", headers=h(op), json=experience_payload(title="Pending"))).json()
    await add_slot(client, op, pending["id"])
    hidden, _ = await _live_with_slot(client, op, admin_token, title="Hidden")
    await client.post(f"/operator/experiences/{hidden}/unpublish", headers=h(op))
    assert await _ids(client) == [live]


async def test_sold_out_and_too_soon_slots_are_not_bookable(client, admin_token, op, db_session):
    sold_out, slot = await _live_with_slot(client, op, admin_token, title="Sold out", capacity=2)
    row = await db_session.get(ExperienceSlot, UUID(slot["id"]))
    row.seats_booked = 2
    await db_session.commit()
    too_soon, _ = await _live_with_slot(client, op, admin_token, title="Too soon", hours=0.5)
    ok, _ = await _live_with_slot(client, op, admin_token, title="Two hours", hours=2)
    assert await _ids(client) == [ok]
    assert (await client.get(f"/experiences/{sold_out}")).json()["slots"] == []
    assert (await client.get(f"/experiences/{too_soon}")).json()["slots"] == []


async def test_suspended_operator_listings_hidden(client, admin_token, op):
    eid, _ = await _live_with_slot(client, op, admin_token)
    me = (await client.get("/auth/me", headers=h(op))).json()
    await client.patch(f"/admin/operators/{me['id']}", json={"operator_status": "suspended"}, headers=h(admin_token))
    assert await _ids(client) == []
    assert (await client.get(f"/experiences/{eid}")).status_code == 404


async def test_filters_city_category_date_max_price(client, admin_token, op):
    a, _ = await _live_with_slot(client, op, admin_token, title="A", city="Munnar", category="adventure", price_per_person=1000, hours=48)
    b, slot_b = await _live_with_slot(client, op, admin_token, title="B", city="Goa", state="Goa", category="food", price_per_person=4000, hours=24 * 10)
    assert await _ids(client, city="goa") == [b]
    assert await _ids(client, category="adventure") == [a]
    assert await _ids(client, max_price=2000) == [a]
    assert await _ids(client, state="kerala") == [a]
    day = slot_b["starts_at"][:10]
    found = await _ids(client, date=day)
    assert b in found
    assert await _ids(client, sort="price_desc") == [b, a]
    assert await _ids(client, sort="price_asc") == [a, b]
    assert (await client.get("/experiences", params={"category": "skydiving"})).status_code == 422


async def test_detail_lists_seats_left_and_hides_private_fields(client, admin_token, op):
    eid, slot = await _live_with_slot(client, op, admin_token, capacity=5)
    body = (await client.get(f"/experiences/{eid}")).json()
    assert [(s["id"], s["seats_left"]) for s in body["slots"]] == [(slot["id"], 5)]
    for private in ("meeting_point", "pending_changes", "rejection_reason", "operator_id"):
        assert private not in body
    assert (await client.get("/experiences/00000000-0000-0000-0000-000000000000")).status_code == 404


async def test_quote_matches_worked_example_and_hides_commission(client, admin_token, op):
    eid, slot = await _live_with_slot(client, op, admin_token)
    res = await client.post(f"/experiences/{eid}/quote", json={"slot_id": slot["id"], "party_size": 2})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["value"], body["service_fee"], body["taxes"], body["total"]) == (5000, 250, 630, 5880)
    assert body["charged"] == {"currency": "INR", "amount_minor": 588000}
    assert "commission" not in body and "operator_amount" not in body


async def test_quote_in_usd_and_unsupported_currency(client, admin_token, op):
    eid, slot = await _live_with_slot(client, op, admin_token)
    await client.put("/admin/fx-rates/USD", headers=h(admin_token), json={"rate_per_inr": "0.012"})
    usd = await client.post(f"/experiences/{eid}/quote", json={"slot_id": slot["id"], "party_size": 2, "currency": "USD"})
    assert usd.json()["charged"] == {"currency": "USD", "amount_minor": 7056}
    bad = await client.post(f"/experiences/{eid}/quote", json={"slot_id": slot["id"], "party_size": 2, "currency": "XYZ"})
    assert bad.status_code == 422


async def test_quote_rejects_bad_party_and_foreign_slot(client, admin_token, op):
    eid, slot = await _live_with_slot(client, op, admin_token, capacity=3)
    other, other_slot = await _live_with_slot(client, op, admin_token, title="Other")
    assert (await client.post(f"/experiences/{eid}/quote", json={"slot_id": slot["id"], "party_size": 4})).status_code == 409
    assert (await client.post(f"/experiences/{eid}/quote", json={"slot_id": slot["id"], "party_size": 0})).status_code == 422
    assert (await client.post(f"/experiences/{eid}/quote", json={"slot_id": slot["id"], "party_size": 21})).status_code == 422
    assert (await client.post(f"/experiences/{eid}/quote", json={"slot_id": other_slot["id"], "party_size": 1})).status_code == 404
