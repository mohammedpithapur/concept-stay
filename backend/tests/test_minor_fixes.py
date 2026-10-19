import pytest

from app.models.property import Property
from tests.test_host_listings import _h, host_a  # noqa: F401
from tests.test_properties import _property_payload
from tests.test_search_filters import _add, _ids

pytestmark = pytest.mark.asyncio


async def test_reject_new_listing_stays_hidden_even_if_published_flag_set(client, host_a, admin_token, db_session):
    create = await client.post("/host/properties", headers=_h(host_a), json=_property_payload())
    pid = create.json()["id"]
    prop = await db_session.get(Property, pid)
    prop.is_published = True  # e.g. admin flipped the publish toggle in the editor
    await db_session.commit()

    res = await client.post(f"/admin/properties/{pid}/reject", headers=_h(admin_token), json={"reason": "photos"})
    assert res.status_code == 200, res.text
    await db_session.refresh(prop)
    assert prop.approval_status == "rejected"
    assert pid not in await _ids(client)


@pytest.mark.parametrize("field", ["price_per_night", "cleaning_fee", "extra_guest_charge_per_night", "pet_charge_per_night"])
async def test_negative_prices_rejected(client, host_a, field):
    res = await client.post("/host/properties", headers=_h(host_a), json=_property_payload({field: -1}))
    assert res.status_code == 422


async def test_destination_wildcards_are_literal(client, admin_headers):
    await _add(client, admin_headers, name="Goa Villa")
    assert await _ids(client, "destination=%25") == []
    assert await _ids(client, "destination=Go")  # normal partial match still works


async def test_quote_enforces_booking_limits(client, admin_headers):
    pid = await _add(client, admin_headers, max_guests=4, min_nights=2)
    base = f"/properties/{pid}/quote?check_in=2031-05-01&check_out=2031-05-04"
    assert (await client.get(f"{base}&guests=2")).status_code == 200
    assert (await client.get(f"{base}&guests=500")).status_code == 400
    assert (await client.get(f"/properties/{pid}/quote?check_in=2031-05-01&check_out=2031-05-02&guests=2")).status_code == 400
    assert (await client.get(f"{base}&guests=2&pets=3")).status_code == 400  # pets not allowed
    assert (await client.get(f"/properties/{pid}/quote?check_in=2031-05-01&check_out=2033-05-01&guests=2")).status_code == 400


