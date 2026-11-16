import pytest
from sqlalchemy import select

from app.models.booking import Booking, BookingStatus


pytestmark = pytest.mark.asyncio


def _property_payload(name: str, overrides: dict | None = None):
    data = {
        "name": name,
        "description": "A lovely test property",
        "address": "123 Test Street",
        "city": "Goa",
        "state": "Goa",
        "country": "India",
        "latitude": 15.2993,
        "longitude": 74.124,
        "contact_phone": "+91 9999999999",
        "contact_email": f"{name.lower().replace(' ', '')}@example.com",
        "check_in_time": "2:00 PM",
        "check_out_time": "11:00 AM",
        "house_rules": ["No smoking"],
        "price_per_night": 5000,
        "cleaning_fee": 800,
        "max_guests": 4,
        "bedrooms": 2,
        "bathrooms": 2,
        "bathrooms_detail": [{"type": "ensuite", "count": 2}],
        "min_nights": 1,
        "pets_allowed": False,
        "pet_charge_per_night": 0,
        "amenities": ["WiFi"],
        "is_published": True,
    }
    if overrides:
        data.update(overrides)
    return data


async def test_booking_invalid_dates(client, user_headers):
    response = await client.post(
        "/bookings",
        headers=user_headers,
        json={"property_id": "00000000-0000-0000-0000-000000000000", "check_in": "2026-06-10", "check_out": "2026-06-10", "guests": 1, "pets": 0},
    )
    assert response.status_code == 422


def _future(days: int) -> str:
    from datetime import date, timedelta
    return (date.today() + timedelta(days=days)).isoformat()


async def test_same_guest_new_overlapping_dates_replace_the_unpaid_hold(client, admin_headers, user_headers):
    prop = (await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Room A"))).json()
    first = await client.post(
        "/bookings", headers=user_headers,
        json={"property_id": prop["id"], "check_in": _future(60), "check_out": _future(62), "guests": 2, "pets": 0},
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        "/bookings", headers=user_headers,
        json={"property_id": prop["id"], "check_in": _future(61), "check_out": _future(63), "guests": 2, "pets": 0},
    )
    assert second.status_code == 200, second.text
    assert second.json()["id"] != first.json()["id"]

    old = await client.get(f"/bookings/{first.json()['id']}", headers=user_headers)
    assert old.json()["status"] == "cancelled"  # the earlier unpaid hold no longer blocks or double-books


async def test_same_guest_cannot_double_book_a_confirmed_stay(client, admin_headers, user_headers, db_session):
    prop = (await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Room B"))).json()
    first = await client.post(
        "/bookings", headers=user_headers,
        json={"property_id": prop["id"], "check_in": _future(60), "check_out": _future(62), "guests": 2, "pets": 0},
    )
    assert first.status_code == 200, first.text
    row = await db_session.get(Booking, first.json()["id"])
    row.status = BookingStatus.confirmed
    await db_session.commit()

    second = await client.post(
        "/bookings", headers=user_headers,
        json={"property_id": prop["id"], "check_in": _future(61), "check_out": _future(63), "guests": 2, "pets": 0},
    )
    assert second.status_code == 409
    assert second.json().get("detail") == "You already have a booking for these dates"


async def test_dates_spanning_two_back_to_back_stays_are_refused_not_a_server_error(client, admin_headers):
    prop = (await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Room C"))).json()

    async def guest(email):
        reg = await client.post("/auth/register", json={"email": email, "password": "GuestPass123!", "full_name": "Guest"})
        return {"Authorization": f"Bearer {reg.json()['access_token']}"}

    a, b, c = await guest("span-a@example.com"), await guest("span-b@example.com"), await guest("span-c@example.com")
    for headers, start, end in ((a, 70, 72), (b, 72, 74)):  # back to back: the second starts the day the first ends
        res = await client.post(
            "/bookings", headers=headers,
            json={"property_id": prop["id"], "check_in": _future(start), "check_out": _future(end), "guests": 2, "pets": 0},
        )
        assert res.status_code == 200, res.text

    third = await client.post(
        "/bookings", headers=c,
        json={"property_id": prop["id"], "check_in": _future(71), "check_out": _future(73), "guests": 2, "pets": 0},
    )
    assert third.status_code == 409, third.text
    assert third.json().get("detail") == "Property is not available for these dates"


async def test_shadow_blocks_created_and_removed(client, admin_headers, user_headers, db_session):
    room = await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Room One"))
    whole = await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Whole Property"))
    room_prop = room.json()
    whole_prop = whole.json()

    group = await client.post("/admin/groups", headers=admin_headers, json={"name": "Test Group"})
    group_id = group.json()["id"]

    await client.post(
        f"/admin/groups/{group_id}/members",
        headers=admin_headers,
        json={"property_id": room_prop["id"], "is_whole_property": False},
    )
    await client.post(
        f"/admin/groups/{group_id}/members",
        headers=admin_headers,
        json={"property_id": whole_prop["id"], "is_whole_property": True},
    )

    booking = await client.post(
        "/bookings",
        headers=user_headers,
        json={"property_id": room_prop["id"], "check_in": "2026-07-01", "check_out": "2026-07-03", "guests": 2, "pets": 0},
    )
    assert booking.status_code == 200, booking.text
    parent_id = booking.json()["id"]

    result = await db_session.execute(
        select(Booking).where(Booking.parent_booking_id == parent_id)
    )
    shadow_blocks = result.scalars().all()
    assert len(shadow_blocks) == 1
    assert str(shadow_blocks[0].property_id) == whole_prop["id"]
    assert shadow_blocks[0].is_shadow_block is True

    cancel = await client.patch(
        f"/bookings/admin/{parent_id}",
        headers=admin_headers,
        json={"status": "cancelled"},
    )
    assert cancel.status_code == 200, cancel.text

    result = await db_session.execute(
        select(Booking).where(Booking.parent_booking_id == parent_id)
    )
    assert result.scalars().all() == []


async def test_shadow_blocks_hidden_from_lists(client, admin_headers, user_headers):
    room = await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Room Two"))
    whole = await client.post("/admin/properties", headers=admin_headers, json=_property_payload("Whole Property 2"))
    room_prop = room.json()
    whole_prop = whole.json()

    group = await client.post("/admin/groups", headers=admin_headers, json={"name": "Test Group 2"})
    group_id = group.json()["id"]

    await client.post(
        f"/admin/groups/{group_id}/members",
        headers=admin_headers,
        json={"property_id": room_prop["id"], "is_whole_property": False},
    )
    await client.post(
        f"/admin/groups/{group_id}/members",
        headers=admin_headers,
        json={"property_id": whole_prop["id"], "is_whole_property": True},
    )

    booking = await client.post(
        "/bookings",
        headers=user_headers,
        json={"property_id": room_prop["id"], "check_in": "2026-07-10", "check_out": "2026-07-12", "guests": 2, "pets": 0},
    )
    assert booking.status_code == 200, booking.text

    my_bookings = await client.get("/bookings/mine", headers=user_headers)
    assert my_bookings.status_code == 200
    assert my_bookings.json()["total"] == 1

    admin_list = await client.get("/bookings/admin/all", headers=admin_headers)
    assert admin_list.status_code == 200
    assert admin_list.json()["total"] == 1
