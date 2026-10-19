import pytest


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _me(client, token):
    res = await client.get("/auth/me", headers=_auth(token))
    assert res.status_code == 200
    return res.json()


async def test_guest_can_become_host_pending(client, user_token):
    res = await client.post("/auth/become-host", headers=_auth(user_token))
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "host"
    assert body["host_status"] == "pending"


async def test_pending_host_blocked_from_host_routes(client, user_token):
    await client.post("/auth/become-host", headers=_auth(user_token))
    res = await client.get("/host/me", headers=_auth(user_token))
    assert res.status_code == 403


async def test_plain_guest_blocked_from_host_routes(client, user_token):
    res = await client.get("/host/me", headers=_auth(user_token))
    assert res.status_code == 403


async def test_admin_approves_host_then_host_allowed(client, user_token, admin_token):
    await client.post("/auth/become-host", headers=_auth(user_token))
    host_id = (await _me(client, user_token))["id"]

    listing = await client.get("/admin/hosts", headers=_auth(admin_token))
    assert listing.status_code == 200
    assert [h["id"] for h in listing.json()] == [host_id]

    approve = await client.patch(
        f"/admin/hosts/{host_id}",
        json={"host_status": "approved"},
        headers=_auth(admin_token),
    )
    assert approve.status_code == 200
    assert approve.json()["host_status"] == "approved"

    res = await client.get("/host/me", headers=_auth(user_token))
    assert res.status_code == 200


async def test_suspended_host_blocked(client, user_token, admin_token):
    await client.post("/auth/become-host", headers=_auth(user_token))
    host_id = (await _me(client, user_token))["id"]
    await client.patch(f"/admin/hosts/{host_id}", json={"host_status": "approved"}, headers=_auth(admin_token))
    await client.patch(f"/admin/hosts/{host_id}", json={"host_status": "suspended"}, headers=_auth(admin_token))
    res = await client.get("/host/me", headers=_auth(user_token))
    assert res.status_code == 403


async def test_admin_hosts_endpoints_require_admin(client, user_token):
    assert (await client.get("/admin/hosts", headers=_auth(user_token))).status_code == 403


async def test_admin_can_use_host_routes(client, admin_token):
    res = await client.get("/host/me", headers=_auth(admin_token))
    assert res.status_code == 200


async def test_admin_cannot_become_host(client, admin_token):
    res = await client.post("/auth/become-host", headers=_auth(admin_token))
    assert res.status_code == 409
