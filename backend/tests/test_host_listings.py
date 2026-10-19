import pytest

from tests.test_properties import _property_payload

pytestmark = pytest.mark.asyncio


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _make_host(client, admin_token, email: str) -> str:
    """Register a guest, apply to become a host, get approved; return the access token."""
    reg = await client.post(
        "/auth/register",
        json={"email": email, "password": "HostPass123!", "full_name": email.split("@")[0]},
    )
    token = reg.json()["access_token"]
    await client.post("/auth/become-host", headers=_h(token))
    me = (await client.get("/auth/me", headers=_h(token))).json()
    res = await client.patch(
        f"/admin/hosts/{me['id']}", json={"host_status": "approved"}, headers=_h(admin_token)
    )
    assert res.status_code == 200, res.text
    return token


@pytest.fixture
async def host_a(client, admin_token):
    return await _make_host(client, admin_token, "hosta@example.com")


@pytest.fixture
async def host_b(client, admin_token):
    return await _make_host(client, admin_token, "hostb@example.com")


async def _create_live_listing(client, host_token, admin_token, **overrides):
    create = await client.post(
        "/host/properties",
        headers=_h(host_token),
        json=_property_payload({"is_published": False, **overrides}),
    )
    assert create.status_code == 200, create.text
    pid = create.json()["id"]
    approve = await client.post(f"/admin/properties/{pid}/approve", headers=_h(admin_token))
    assert approve.status_code == 200, approve.text
    return pid


async def test_host_create_is_pending_and_hidden(client, host_a):
    res = await client.post(
        "/host/properties", headers=_h(host_a), json=_property_payload({"is_published": True, "is_featured": True})
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["approval_status"] == "pending_review"
    assert body["is_published"] is False
    assert body["is_featured"] is False
    listing = await client.get("/properties")
    assert listing.json()["items"] == []
    assert (await client.get(f"/properties/{body['id']}")).status_code == 404


async def test_pending_host_cannot_create(client, user_token):
    await client.post("/auth/become-host", headers=_h(user_token))
    res = await client.post("/host/properties", headers=_h(user_token), json=_property_payload())
    assert res.status_code == 403


async def test_admin_approve_publishes(client, host_a, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token)
    pub = await client.get(f"/properties/{pid}")
    assert pub.status_code == 200
    assert pub.json()["approval_status"] == "approved"
    assert [p["id"] for p in (await client.get("/properties")).json()["items"]] == [pid]


async def test_host_sees_only_own_properties(client, host_a, host_b, admin_token):
    pid_a = await _create_live_listing(client, host_a, admin_token, name="A place")
    await _create_live_listing(client, host_b, admin_token, name="B place")
    mine = (await client.get("/host/properties", headers=_h(host_a))).json()
    assert [p["id"] for p in mine] == [pid_a]


async def test_other_host_cannot_edit_or_see_property(client, host_a, host_b, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token)
    patch = await client.patch(f"/host/properties/{pid}", headers=_h(host_b), json={"name": "Hijack"})
    assert patch.status_code == 403
    cal = await client.get(f"/host/properties/{pid}/calendar", headers=_h(host_b))
    assert cal.status_code == 403
    block = await client.post(
        f"/host/properties/{pid}/blocks",
        headers=_h(host_b),
        json={"check_in": "2030-01-01", "check_out": "2030-01-03"},
    )
    assert block.status_code == 403


async def test_edit_goes_to_pending_changes_until_approved(client, host_a, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token, name="Original")
    patch = await client.patch(
        f"/host/properties/{pid}", headers=_h(host_a), json={"name": "Renamed", "price_per_night": 9999}
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["pending_changes"]["name"] == "Renamed"
    assert patch.json()["name"] == "Original"

    public = (await client.get(f"/properties/{pid}")).json()
    assert public["name"] == "Original"
    assert public["price_per_night"] == 5000
    assert public["approval_status"] == "approved"  # stays live while the edit is pending

    queue = (await client.get("/admin/review-queue", headers=_h(admin_token))).json()
    assert [p["id"] for p in queue] == [pid]

    approve = await client.post(f"/admin/properties/{pid}/approve", headers=_h(admin_token))
    assert approve.status_code == 200
    public = (await client.get(f"/properties/{pid}")).json()
    assert public["name"] == "Renamed"
    assert public["price_per_night"] == 9999
    assert (await client.get("/admin/review-queue", headers=_h(admin_token))).json() == []


async def test_host_cannot_publish_or_feature_via_patch(client, host_a, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token)
    patch = await client.patch(
        f"/host/properties/{pid}", headers=_h(host_a), json={"is_published": False, "is_featured": True}
    )
    assert patch.status_code == 200
    assert patch.json()["pending_changes"] in (None, {})
    public = (await client.get(f"/properties/{pid}")).json()
    assert public["is_featured"] is False


async def test_reject_new_listing_stores_reason(client, host_a, admin_token):
    create = await client.post("/host/properties", headers=_h(host_a), json=_property_payload())
    pid = create.json()["id"]
    rej = await client.post(
        f"/admin/properties/{pid}/reject", headers=_h(admin_token), json={"reason": "Photos too dark"}
    )
    assert rej.status_code == 200, rej.text
    mine = (await client.get("/host/properties", headers=_h(host_a))).json()[0]
    assert mine["approval_status"] == "rejected"
    assert mine["rejection_reason"] == "Photos too dark"
    assert (await client.get(f"/properties/{pid}")).status_code == 404


async def test_reject_edit_on_live_listing_keeps_it_live(client, host_a, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token, name="Stable")
    await client.patch(f"/host/properties/{pid}", headers=_h(host_a), json={"name": "Bad edit"})
    rej = await client.post(
        f"/admin/properties/{pid}/reject", headers=_h(admin_token), json={"reason": "Misleading title"}
    )
    assert rej.status_code == 200
    public = await client.get(f"/properties/{pid}")
    assert public.status_code == 200
    assert public.json()["name"] == "Stable"
    mine = (await client.get("/host/properties", headers=_h(host_a))).json()[0]
    assert mine["pending_changes"] is None
    assert mine["rejection_reason"] == "Misleading title"


async def test_admin_sets_verification(client, host_a, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token)
    res = await client.patch(
        f"/admin/properties/{pid}/verification", headers=_h(admin_token), json={"status": "verified"}
    )
    assert res.status_code == 200, res.text
    body = (await client.get(f"/properties/{pid}")).json()
    assert body["verification_status"] == "verified"
    assert body["verified_at"] is not None
    bad = await client.patch(
        f"/admin/properties/{pid}/verification", headers=_h(admin_token), json={"status": "shiny"}
    )
    assert bad.status_code == 422


async def test_non_admin_cannot_approve(client, host_a, admin_token):
    create = await client.post("/host/properties", headers=_h(host_a), json=_property_payload())
    pid = create.json()["id"]
    res = await client.post(f"/admin/properties/{pid}/approve", headers=_h(host_a))
    assert res.status_code == 403


async def test_host_calendar_block_flow(client, host_a, admin_token):
    pid = await _create_live_listing(client, host_a, admin_token)
    block = await client.post(
        f"/host/properties/{pid}/blocks",
        headers=_h(host_a),
        json={"check_in": "2030-01-01", "check_out": "2030-01-03", "note": "Maintenance"},
    )
    assert block.status_code == 201, block.text
    cal = await client.get(
        f"/host/properties/{pid}/calendar?from_date=2029-12-01&to_date=2030-02-01", headers=_h(host_a)
    )
    assert cal.status_code == 200
    assert [e["type"] for e in cal.json()["events"]] == ["admin_block"]
    rm = await client.delete(f"/host/properties/{pid}/blocks/{block.json()['id']}", headers=_h(host_a))
    assert rm.status_code == 200


async def test_host_dashboard_and_bookings_scoped(client, host_a, host_b, admin_token, user_token):
    pid_a = await _create_live_listing(client, host_a, admin_token)
    pid_b = await _create_live_listing(client, host_b, admin_token)
    for pid in (pid_a, pid_b):
        res = await client.post(
            "/bookings",
            headers=_h(user_token),
            json={"property_id": pid, "check_in": "2031-05-01", "check_out": "2031-05-03", "guests": 2, "pets": 0},
        )
        assert res.status_code == 200, res.text
        confirm = await client.patch(
            f"/bookings/admin/{res.json()['id']}", headers=_h(admin_token), json={"status": "confirmed"}
        )
        assert confirm.status_code == 200, confirm.text
    bookings = (await client.get("/host/bookings", headers=_h(host_a))).json()
    assert [b["property_id"] for b in bookings["items"]] == [pid_a]
    dash = (await client.get("/host/dashboard", headers=_h(host_a))).json()
    assert set(dash) >= {"bookings_this_month", "revenue", "occupancy_percent", "upcoming"}
    assert [b["property_id"] for b in dash["upcoming"]] == [pid_a]


async def test_host_can_upload_image(client, host_a, user_token, monkeypatch):
    monkeypatch.setattr(
        "app.routers.admin.upload_property_image_from_bytes",
        lambda image_bytes, mime_type, folder="properties": "https://cdn.example.com/properties/h.png",
    )
    ok = await client.post(
        "/host/upload-image", headers=_h(host_a), files={"file": ("h.png", b"fake", "image/png")}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json() == {"url": "https://cdn.example.com/properties/h.png"}
    guest = await client.post(
        "/host/upload-image", headers=_h(user_token), files={"file": ("h.png", b"fake", "image/png")}
    )
    assert guest.status_code == 403


async def test_host_can_request_presigned_urls(client, host_a, user_token, monkeypatch):
    async def fake_presign(items, folder="properties"):
        return [{"id": i["id"], "upload_url": "https://up", "public_url": "https://pub"} for i in items]

    monkeypatch.setattr("app.routers.admin.async_generate_batch_presigned_upload_urls", fake_presign)
    body = {"items": [{"id": "a", "mime_type": "image/png"}], "folder": "properties"}
    ok = await client.post("/host/presigned-upload-urls", headers=_h(host_a), json=body)
    assert ok.status_code == 200, ok.text
    assert ok.json()["items"][0]["public_url"] == "https://pub"
    assert (await client.post("/host/presigned-upload-urls", headers=_h(user_token), json=body)).status_code == 403
