import pytest

from tests.experience_helpers import h, make_operator
from tests.test_host_listings import _make_host

pytestmark = pytest.mark.asyncio


async def _me(client, token):
    res = await client.get("/auth/me", headers=h(token))
    assert res.status_code == 200
    return res.json()


async def test_guest_can_become_operator_pending(client, user_token):
    res = await client.post("/auth/become-operator", headers=h(user_token))
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "operator"
    assert body["operator_status"] == "pending"


async def test_host_cannot_become_operator(client, admin_token):
    host = await _make_host(client, admin_token, "hostx@example.com")
    res = await client.post("/auth/become-operator", headers=h(host))
    assert res.status_code == 409


async def test_operator_cannot_become_host(client, admin_token):
    op = await make_operator(client, admin_token, "opx@example.com")
    res = await client.post("/auth/become-host", headers=h(op))
    assert res.status_code == 409


async def test_any_status_route_allows_pending_operator_but_not_guest(client, user_token):
    guest = await client.get("/operator/profile/completeness", headers=h(user_token))
    assert guest.status_code == 403
    await client.post("/auth/become-operator", headers=h(user_token))
    pending = await client.get("/operator/profile/completeness", headers=h(user_token))
    assert pending.status_code == 200


async def test_admin_approves_and_suspends_operator(client, user_token, admin_token):
    await client.post("/auth/become-operator", headers=h(user_token))
    op_id = (await _me(client, user_token))["id"]
    listing = await client.get("/admin/operators", headers=h(admin_token))
    assert [o["id"] for o in listing.json()] == [op_id]
    res = await client.patch(
        f"/admin/operators/{op_id}", json={"operator_status": "approved"}, headers=h(admin_token)
    )
    assert res.status_code == 200 and res.json()["operator_status"] == "approved"
    res = await client.patch(
        f"/admin/operators/{op_id}", json={"operator_status": "suspended"}, headers=h(admin_token)
    )
    assert res.json()["operator_status"] == "suspended"
    guest = await client.patch(
        f"/admin/operators/{op_id}", json={"operator_status": "approved"}, headers=h(user_token)
    )
    assert guest.status_code == 403


async def test_operator_profile_roundtrip_and_completeness(client, admin_token):
    op = await make_operator(client, admin_token, "opprofile@example.com")
    before = await client.get("/operator/profile/completeness", headers=h(op))
    assert before.json()["complete"] is False
    assert "legal_name" in before.json()["missing"]
    saved = await client.put("/operator/profile", headers=h(op), json={"legal_name": "Trail Co"})
    assert saved.status_code == 200, saved.text
    assert (await client.get("/operator/profile", headers=h(op))).json()["legal_name"] == "Trail Co"
    after = await client.get("/operator/profile/completeness", headers=h(op))
    assert "legal_name" not in after.json()["missing"]


async def test_operator_kyc_visible_to_admin(client, admin_token):
    op = await make_operator(client, admin_token, "opkyc@example.com")
    await client.put("/operator/profile", headers=h(op), json={"legal_name": "Trail Co"})
    listing = await client.get("/admin/kyc", headers=h(admin_token))
    assert listing.status_code == 200
    assert [row["legal_name"] for row in listing.json()] == ["Trail Co"]
