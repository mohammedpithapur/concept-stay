import pytest

from tests.test_properties import _property_payload

pytestmark = pytest.mark.asyncio


async def test_new_listing_fields_round_trip(admin_headers, client):
    payload = _property_payload(
        {
            "property_type": "homestay",
            "categories": ["offbeat", "mountain"],
            "experience_tags": ["romantic", "remote_offgrid"],
            "cancellation_policy": "moderate",
            "number_of_rooms": 3,
            "about_stay": "About",
            "the_space": "Space",
            "location_notes": "Location",
            "what_guests_love": "Love",
            "things_to_know": "Know",
        }
    )
    create = await client.post("/admin/properties", headers=admin_headers, json=payload)
    assert create.status_code == 200, create.text
    body = (await client.get(f"/properties/{create.json()['id']}")).json()
    assert body["property_type"] == "homestay"
    assert body["categories"] == ["offbeat", "mountain"]
    assert body["experience_tags"] == ["romantic", "remote_offgrid"]
    assert body["cancellation_policy"] == "moderate"
    assert body["number_of_rooms"] == 3
    assert body["about_stay"] == "About"
    assert body["things_to_know"] == "Know"
    assert body["verification_status"] == "unverified"
    assert body["approval_status"] == "approved"


async def test_defaults_for_legacy_style_payload(admin_headers, client):
    create = await client.post("/admin/properties", headers=admin_headers, json=_property_payload())
    body = (await client.get(f"/properties/{create.json()['id']}")).json()
    assert body["property_type"] == "villa"
    assert body["cancellation_policy"] == "flexible"
    assert body["categories"] == []
    assert body["number_of_rooms"] == 1


@pytest.mark.parametrize(
    "bad",
    [
        {"property_type": "castle"},
        {"cancellation_policy": "whenever"},
        {"categories": ["not-a-category"]},
        {"experience_tags": ["not-a-tag"]},
    ],
)
async def test_invalid_enum_values_rejected(admin_headers, client, bad):
    res = await client.post("/admin/properties", headers=admin_headers, json=_property_payload(bad))
    assert res.status_code == 422


async def test_pending_changes_not_exposed_publicly(admin_headers, client):
    create = await client.post("/admin/properties", headers=admin_headers, json=_property_payload())
    body = (await client.get(f"/properties/{create.json()['id']}")).json()
    assert "pending_changes" not in body
    assert "rejection_reason" not in body
