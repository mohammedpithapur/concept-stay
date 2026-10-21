from datetime import date, timedelta

import pytest

from app.routers import connections as connections_router
from tests.test_host_listings import _h
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _no_push(monkeypatch):
    sent: list[tuple] = []

    async def fake(user_id, title, body, url="/dashboard", **_):
        sent.append((str(user_id), title))
        return 1

    monkeypatch.setattr(connections_router, "send_push_to_user", fake)
    return sent


def _day(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


class Guest:
    def __init__(self, token: str, user_id: str, name: str):
        self.token, self.id, self.name = token, user_id, name

    @property
    def h(self) -> dict:
        return _h(self.token)


async def _guest(client, name: str, opted_in: bool = True) -> Guest:
    email = f"{name.lower()}@example.com"
    reg = await client.post("/auth/register", json={"email": email, "password": "GuestPass123!", "full_name": f"{name} Surname", "phone": "+9199000000" + str(abs(hash(name)) % 100).zfill(2)})
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=_h(token))).json()
    g = Guest(token, me["id"], name)
    if opted_in:
        res = await client.patch("/users/profile", headers=g.h, json={"open_to_connections": True})
        assert res.status_code == 200 and res.json()["open_to_connections"] is True
    return g


async def _stay(client, db_session, guest: Guest, pid: str, start: int, nights: int = 3) -> dict:
    booking = await _book(client, guest.token, pid, check_in=_day(start), check_out=_day(start + nights))
    res = await _pay(client, db_session, guest.token, booking, order=f"order_{guest.name}", pay_id=f"pay_{guest.name}")
    assert res.status_code == 200, res.text
    return booking


async def _co_guests(client, guest: Guest, booking: dict):
    return await client.get(f"/bookings/{booking['id']}/co-guests", headers=guest.h)


async def test_not_visible_unless_opted_in(client, admin_headers, db_session):
    pid = await _listing(client, admin_headers)
    a = await _guest(client, "Asha")
    b = await _guest(client, "Bela", opted_in=False)
    ba = await _stay(client, db_session, a, pid, 60)
    await _stay(client, db_session, b, pid, 63)
    assert (await _co_guests(client, a, ba)).json() == []

    await client.patch("/users/profile", headers=b.h, json={"open_to_connections": True})
    listed = (await _co_guests(client, a, ba)).json()
    assert [c["first_name"] for c in listed] == ["Bela"]
    assert set(listed[0]) == {"user_id", "first_name", "check_in", "check_out", "connection_status"}

    # the viewer must be opted in as well: nobody browses others while invisible themselves
    await client.patch("/users/profile", headers=a.h, json={"open_to_connections": False})
    assert (await _co_guests(client, a, ba)).status_code == 403


async def test_only_overlapping_same_property_guests_listed(client, admin_headers, db_session):
    pid, other_pid = await _listing(client, admin_headers), await _listing(client, admin_headers, name="Elsewhere")
    a, near, far, late, elsewhere = [await _guest(client, n) for n in ("Asha", "Near", "Far", "Late", "Elsewhere")]
    ba = await _stay(client, db_session, a, pid, 60)          # nights 60..63
    await _stay(client, db_session, near, pid, 63)            # back-to-back: within the window
    await _stay(client, db_session, late, pid, 70)            # a week later: outside the window
    await _stay(client, db_session, far, pid, 150)
    await _stay(client, db_session, elsewhere, other_pid, 60)  # same dates, different property
    listed = (await _co_guests(client, a, ba)).json()
    assert [c["first_name"] for c in listed] == ["Near"]


async def test_request_requires_shared_stay(client, admin_headers, db_session):
    pid = await _listing(client, admin_headers)
    a, far = await _guest(client, "Asha"), await _guest(client, "Far")
    ba = await _stay(client, db_session, a, pid, 60)
    await _stay(client, db_session, far, pid, 150)
    res = await client.post("/connections", headers=a.h, json={"to_user_id": far.id, "booking_id": ba["id"]})
    assert res.status_code == 403
    stranger = await client.post("/connections", headers=a.h, json={"to_user_id": "00000000-0000-0000-0000-000000000000", "booking_id": ba["id"]})
    assert stranger.status_code == 403


async def test_no_contact_details_before_accept(client, admin_headers, db_session, _no_push):
    pid = await _listing(client, admin_headers)
    a, b = await _guest(client, "Asha"), await _guest(client, "Bela")
    ba = await _stay(client, db_session, a, pid, 60)
    await _stay(client, db_session, b, pid, 63)
    req = await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})
    assert req.status_code == 201, req.text
    assert any(uid == b.id for uid, _ in _no_push)  # the addressee is notified

    for text in (
        (await _co_guests(client, a, ba)).text,
        (await client.get("/connections", headers=a.h)).text,
        (await client.get("/connections", headers=b.h)).text,
        req.text,
    ):
        assert "@example.com" not in text and "phone" not in text and "email" not in text
    out = (await client.get("/connections", headers=a.h)).json()
    inc = (await client.get("/connections", headers=b.h)).json()
    assert len(out["outgoing"]) == 1 and out["connected"] == [] and len(inc["incoming"]) == 1
    assert (await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})).status_code == 409


async def test_accept_reveals_contacts_to_both(client, admin_headers, db_session, _no_push):
    pid = await _listing(client, admin_headers)
    a, b = await _guest(client, "Asha"), await _guest(client, "Bela")
    ba = await _stay(client, db_session, a, pid, 60)
    await _stay(client, db_session, b, pid, 63)
    cid = (await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})).json()["id"]
    assert (await client.post(f"/connections/{cid}/accept", headers=a.h)).status_code == 403  # only the addressee
    assert (await client.post(f"/connections/{cid}/accept", headers=b.h)).status_code == 200
    assert any(uid == a.id for uid, _ in _no_push)  # the requester hears back

    a_view = (await client.get("/connections", headers=a.h)).json()["connected"]
    b_view = (await client.get("/connections", headers=b.h)).json()["connected"]
    assert a_view[0]["email"] == "bela@example.com" and a_view[0]["phone"]
    assert b_view[0]["email"] == "asha@example.com" and b_view[0]["phone"]


async def test_decline_and_block_hide_each_other(client, admin_headers, db_session):
    pid = await _listing(client, admin_headers)
    a, b, c = await _guest(client, "Asha"), await _guest(client, "Bela"), await _guest(client, "Chai")
    ba = await _stay(client, db_session, a, pid, 60)
    bb = await _stay(client, db_session, b, pid, 63)
    bc = await _stay(client, db_session, c, pid, 66)

    cid = (await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})).json()["id"]
    assert (await client.post(f"/connections/{cid}/decline", headers=b.h)).status_code == 200
    assert [x["first_name"] for x in (await _co_guests(client, a, ba)).json()] == []
    assert [x["first_name"] for x in (await _co_guests(client, b, bb)).json()] == ["Chai"]
    assert (await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})).status_code in (403, 409)

    cid2 = (await client.post("/connections", headers=b.h, json={"to_user_id": c.id, "booking_id": bb["id"]})).json()["id"]
    assert (await client.post(f"/connections/{cid2}/block", headers=c.h)).status_code == 200
    assert (await _co_guests(client, b, bb)).json() == []
    assert (await _co_guests(client, c, bc)).json() == []
    assert (await client.post("/connections", headers=b.h, json={"to_user_id": c.id, "booking_id": bb["id"]})).status_code in (403, 409)
    assert (await client.get("/connections", headers=b.h)).json() == {"incoming": [], "outgoing": [], "connected": []}


async def test_cannot_request_after_window(client, admin_headers, db_session):
    pid = await _listing(client, admin_headers)
    a, b = await _guest(client, "Asha"), await _guest(client, "Bela")
    ba = await _stay(client, db_session, a, pid, -40)  # checked out 37 days ago, well past the 7-day window
    await _stay(client, db_session, b, pid, -37)
    res = await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})
    assert res.status_code == 409


async def test_withdraw_removes_contact_access(client, admin_headers, db_session):
    pid = await _listing(client, admin_headers)
    a, b = await _guest(client, "Asha"), await _guest(client, "Bela")
    ba = await _stay(client, db_session, a, pid, 60)
    await _stay(client, db_session, b, pid, 63)
    cid = (await client.post("/connections", headers=a.h, json={"to_user_id": b.id, "booking_id": ba["id"]})).json()["id"]
    await client.post(f"/connections/{cid}/accept", headers=b.h)
    assert len((await client.get("/connections", headers=b.h)).json()["connected"]) == 1
    other = await _guest(client, "Nosy")
    assert (await client.delete(f"/connections/{cid}", headers=other.h)).status_code == 404  # not a party
    assert (await client.delete(f"/connections/{cid}", headers=a.h)).status_code == 204
    assert (await client.get("/connections", headers=b.h)).json()["connected"] == []
    assert (await client.get("/connections", headers=a.h)).json()["connected"] == []
