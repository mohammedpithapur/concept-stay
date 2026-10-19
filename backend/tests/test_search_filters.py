import pytest

from tests.test_host_listings import _create_live_listing, _h, _make_host
from tests.test_properties import _property_payload

pytestmark = pytest.mark.asyncio


async def _add(client, admin_headers, **overrides) -> str:
    res = await client.post("/admin/properties", headers=admin_headers, json=_property_payload(overrides))
    assert res.status_code == 200, res.text
    return res.json()["id"]


async def _ids(client, query: str = "") -> list[str]:
    res = await client.get(f"/properties?{query}")
    assert res.status_code == 200, res.text
    return [p["id"] for p in res.json()["items"]]


async def test_filter_by_property_type(client, admin_headers):
    home = await _add(client, admin_headers, name="Home", property_type="homestay")
    await _add(client, admin_headers, name="Villa", property_type="villa")
    assert await _ids(client, "property_type=homestay") == [home]
    both = await _ids(client, "property_type=homestay,villa")
    assert len(both) == 2


async def test_filter_by_category_and_experience(client, admin_headers):
    a = await _add(client, admin_headers, name="A", categories=["offbeat", "mountain"], experience_tags=["romantic"])
    b = await _add(client, admin_headers, name="B", categories=["lakeside"], experience_tags=["family", "wellness"])
    assert await _ids(client, "category=mountain") == [a]
    assert await _ids(client, "category=lakeside") == [b]
    assert await _ids(client, "experience=romantic") == [a]
    assert sorted(await _ids(client, "experience=romantic,wellness")) == sorted([a, b])


async def test_verified_only(client, admin_headers):
    a = await _add(client, admin_headers, name="Verified one")
    await _add(client, admin_headers, name="Plain")
    res = await client.patch(
        f"/admin/properties/{a}/verification", headers=admin_headers, json={"status": "verified"}
    )
    assert res.status_code == 200
    assert await _ids(client, "verified_only=true") == [a]
    assert len(await _ids(client)) == 2


async def test_suspended_verification_hides_listing(client, admin_headers):
    a = await _add(client, admin_headers, name="Will be suspended")
    await client.patch(f"/admin/properties/{a}/verification", headers=admin_headers, json={"status": "suspended"})
    assert await _ids(client) == []
    assert (await client.get(f"/properties/{a}")).status_code == 404


async def test_max_price_50000_means_unbounded(client, admin_headers):
    cheap = await _add(client, admin_headers, name="Cheap", price_per_night=4000)
    luxe = await _add(client, admin_headers, name="Luxe", price_per_night=80000)
    assert await _ids(client, "max_price=10000") == [cheap]
    assert sorted(await _ids(client, "max_price=50000")) == sorted([cheap, luxe])
    assert await _ids(client, "min_price=50000&max_price=50000") == [luxe]


async def test_destination_matches_city_or_state(client, admin_headers):
    goa = await _add(client, admin_headers, name="Goa", city="Panjim", state="Goa")
    await _add(client, admin_headers, name="Shillong", city="Shillong", state="Meghalaya")
    assert await _ids(client, "destination=goa") == [goa]
    assert await _ids(client, "destination=Panjim") == [goa]


async def test_sort_price(client, admin_headers):
    low = await _add(client, admin_headers, name="Low", price_per_night=1000)
    high = await _add(client, admin_headers, name="High", price_per_night=9000)
    assert await _ids(client, "sort=price_asc") == [low, high]
    assert await _ids(client, "sort=price_desc") == [high, low]


async def test_destinations_and_categories_endpoints(client, admin_headers):
    await _add(client, admin_headers, name="One", city="Panjim", state="Goa", categories=["offbeat"])
    await _add(client, admin_headers, name="Two", city="Panjim", state="Goa", categories=["offbeat", "budget"])
    dest = (await client.get("/properties/destinations")).json()
    assert dest == [{"state": "Goa", "city": "Panjim", "count": 2}]
    cats = {c["slug"]: c for c in (await client.get("/properties/categories")).json()}
    assert set(cats) == {"offbeat", "mountain", "lakeside", "farm", "homestay", "boutique", "nature", "budget"}
    assert cats["offbeat"]["count"] == 2 and cats["offbeat"]["label"] == "Offbeat Stays"
    assert cats["budget"]["count"] == 1 and cats["mountain"]["count"] == 0


async def test_unapproved_listing_not_public(client, admin_token):
    host = await _make_host(client, admin_token, "pendinghost@example.com")
    create = await client.post("/host/properties", headers=_h(host), json=_property_payload())
    assert create.status_code == 200
    assert await _ids(client) == []
    assert (await client.get("/properties/destinations")).json() == []


async def test_suspended_host_listings_hidden_everywhere(client, admin_token, user_token):
    host = await _make_host(client, admin_token, "suspendme@example.com")
    pid = await _create_live_listing(client, host, admin_token, is_featured=False)
    assert await _ids(client) == [pid]

    me = (await client.get("/auth/me", headers=_h(host))).json()
    res = await client.patch(f"/admin/hosts/{me['id']}", headers=_h(admin_token), json={"host_status": "suspended"})
    assert res.status_code == 200

    assert await _ids(client) == []
    assert (await client.get(f"/properties/{pid}")).status_code == 404
    assert (await client.get("/properties/featured")).json() == []
    assert (await client.get("/properties/locations")).json()["locations"] == []
    booking = await client.post(
        "/bookings",
        headers=_h(user_token),
        json={"property_id": pid, "check_in": "2031-06-01", "check_out": "2031-06-03", "guests": 2},
    )
    assert booking.status_code == 404


async def test_filter_by_amenities(client, admin_headers):
    wifi = await _add(client, admin_headers, name="Wifi", amenities=["WiFi", "Parking"])
    await _add(client, admin_headers, name="None", amenities=["Pool"])
    assert await _ids(client, "amenities=WiFi") == [wifi]
