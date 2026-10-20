import pytest
from sqlalchemy import select

from app.models.host_profile import HostProfile
from app.services import private_storage
from tests.test_host_listings import _h, _make_host
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

pytestmark = pytest.mark.asyncio

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
PROFILE = {
    "legal_name": "Asha Verma",
    "phone": "+919800000000",
    "pan_number": "ABCDE1234F",
    "aadhaar_last4": "4321",
    "bank_holder": "Asha Verma",
    "bank_account_number": "123456789012",
    "bank_ifsc": "HDFC0001234",
}


class FakeStorage:
    def __init__(self):
        self.files: dict[str, bytes] = {}

    async def upload_private(self, prefix, filename, content, mime):
        path = f"{prefix}/{len(self.files)}-{filename}"
        self.files[path] = content
        return path

    async def signed_url(self, path, expires_in=300):
        return f"https://signed.test/{path}?exp={expires_in}"

    async def delete_private(self, path):
        self.files.pop(path, None)


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(private_storage, "upload_private", fake.upload_private)
    monkeypatch.setattr(private_storage, "signed_url", fake.signed_url)
    monkeypatch.setattr(private_storage, "delete_private", fake.delete_private)
    return fake


@pytest.fixture
async def pending_host(client, admin_token):
    """A host who has applied but is not yet approved."""
    reg = await client.post(
        "/auth/register", json={"email": "newhost@example.com", "password": "HostPass123!", "full_name": "New Host"}
    )
    token = reg.json()["access_token"]
    assert (await client.post("/auth/become-host", headers=_h(token))).status_code == 200
    me = (await client.get("/auth/me", headers=_h(token))).json()
    return token, me["id"]


async def _upload(client, token, doc_type, content=PNG, mime="image/png", name="doc.png"):
    return await client.post(
        "/host/profile/documents", headers=_h(token), data={"doc_type": doc_type}, files={"file": (name, content, mime)}
    )


async def _complete_profile(client, token):
    assert (await client.put("/host/profile", headers=_h(token), json=PROFILE)).status_code == 200
    for doc in ("pan", "aadhaar"):
        assert (await _upload(client, token, doc)).status_code == 201


async def test_pending_host_can_save_profile(client, pending_host):
    token, _ = pending_host
    res = await client.put("/host/profile", headers=_h(token), json=PROFILE)
    assert res.status_code == 200, res.text
    assert res.json()["kyc_status"] == "incomplete"  # documents still missing
    assert (await client.get("/host/profile", headers=_h(token))).json()["legal_name"] == "Asha Verma"


async def test_pan_and_account_never_returned_in_clear_to_host(client, pending_host, db_session):
    token, _ = pending_host
    body = (await client.put("/host/profile", headers=_h(token), json=PROFILE)).json()
    assert body["pan_masked"] == "******234F"
    assert body["bank_account_masked"] == "********9012"
    assert "ABCDE1234F" not in str(body) and "123456789012" not in str(body)
    row = (await db_session.execute(select(HostProfile))).scalar_one()
    assert row.pan_enc != "ABCDE1234F" and "ABCDE" not in row.pan_enc
    assert row.bank_account_enc != "123456789012" and "1234567" not in row.bank_account_enc


async def test_completeness_lists_missing_items(client, pending_host):
    token, _ = pending_host
    empty = (await client.get("/host/profile/completeness", headers=_h(token))).json()
    assert empty["complete"] is False
    assert {"legal_name", "pan_number", "bank_account_number", "pan_document", "id_document"} <= set(empty["missing"])
    await _complete_profile(client, token)
    done = (await client.get("/host/profile/completeness", headers=_h(token))).json()
    assert done == {"complete": True, "missing": [], "kyc_status": "submitted"}


async def test_passport_counts_as_id_document(client, pending_host):
    token, _ = pending_host
    await client.put("/host/profile", headers=_h(token), json=PROFILE)
    await _upload(client, token, "pan")
    await _upload(client, token, "passport")
    assert (await client.get("/host/profile/completeness", headers=_h(token))).json()["complete"] is True


async def test_upload_rejects_wrong_type_and_oversize(client, pending_host):
    token, _ = pending_host
    bad = await _upload(client, token, "pan", content=b"not an image", mime="text/plain", name="a.txt")
    assert bad.status_code == 422
    fake_png = await _upload(client, token, "pan", content=b"MZ-executable-bytes", mime="image/png")
    assert fake_png.status_code == 422  # declared type must match the file's real signature
    big = await _upload(client, token, "pan", content=PNG + b"0" * (8 * 1024 * 1024))
    assert big.status_code == 413
    unknown = await _upload(client, token, "selfie")
    assert unknown.status_code == 422


async def test_aadhaar_full_number_is_rejected(client, pending_host):
    token, _ = pending_host
    res = await client.put("/host/profile", headers=_h(token), json={**PROFILE, "aadhaar_last4": "123456789012"})
    assert res.status_code == 422


async def test_other_users_cannot_read_documents(client, admin_token, user_token, pending_host):
    token, host_id = pending_host
    await _complete_profile(client, token)
    other_host = await _make_host(client, admin_token, "otherhost@example.com")
    for caller in (user_token, other_host, token):  # a guest, another host, the owner: none are admins
        assert (await client.get(f"/admin/kyc/{host_id}", headers=_h(caller))).status_code == 403
        assert (await client.get("/admin/kyc", headers=_h(caller))).status_code == 403
    docs = (await client.get("/host/profile", headers=_h(token))).json()["documents"]
    assert all("signed_url" not in d and "storage_path" not in d for d in docs)
    # another host cannot delete my document either
    assert (await client.delete(f"/host/profile/documents/{docs[0]['id']}", headers=_h(other_host))).status_code == 404
    assert (await client.get("/host/profile", headers=_h(user_token))).status_code == 403


async def test_admin_sees_signed_urls_and_full_values(client, admin_token, pending_host):
    token, host_id = pending_host
    await _complete_profile(client, token)
    detail = (await client.get(f"/admin/kyc/{host_id}", headers=_h(admin_token))).json()
    assert detail["pan_number"] == "ABCDE1234F" and detail["bank_account_number"] == "123456789012"
    assert len(detail["documents"]) == 2
    assert all(d["signed_url"].endswith("?exp=300") for d in detail["documents"])
    listing = (await client.get("/admin/kyc?status=submitted", headers=_h(admin_token))).json()
    assert [r["user_id"] for r in listing] == [host_id]
    assert "pan_number" not in listing[0]


async def test_verify_and_reject_flow(client, admin_token, pending_host):
    token, host_id = pending_host
    await _complete_profile(client, token)
    rej = await client.post(f"/admin/kyc/{host_id}/reject", headers=_h(admin_token), json={"reason": "PAN blurry"})
    assert rej.status_code == 200
    mine = (await client.get("/host/profile", headers=_h(token))).json()
    assert mine["kyc_status"] == "rejected" and mine["rejection_reason"] == "PAN blurry"
    await client.put("/host/profile", headers=_h(token), json={"legal_name": "Asha Verma Jr"})  # host fixes and resubmits
    assert (await client.get("/host/profile", headers=_h(token))).json()["kyc_status"] == "submitted"
    ok = await client.post(f"/admin/kyc/{host_id}/verify", headers=_h(admin_token))
    assert ok.status_code == 200 and ok.json()["kyc_status"] == "verified"
    # editing bank details of a verified profile asks for a fresh review
    await client.put("/host/profile", headers=_h(token), json={"bank_ifsc": "ICIC0004321"})
    assert (await client.get("/host/profile", headers=_h(token))).json()["kyc_status"] == "submitted"


async def test_cannot_verify_incomplete_profile(client, admin_token, pending_host):
    token, host_id = pending_host
    await client.put("/host/profile", headers=_h(token), json=PROFILE)
    assert (await client.post(f"/admin/kyc/{host_id}/verify", headers=_h(admin_token))).status_code == 409


async def test_mark_paid_requires_verified_kyc(client, admin_token, admin_headers, user_token, db_session):
    host = await _make_host(client, admin_token, "payee@example.com")
    host_id = (await client.get("/auth/me", headers=_h(host))).json()["id"]
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid)
    assert (await _pay(client, db_session, user_token, booking)).status_code == 200
    # move the listing to the host so the payout belongs to them
    from app.models.payout import Payout

    payout = (await db_session.execute(select(Payout))).scalar_one()
    payout.host_id = host_id
    await db_session.commit()

    blocked = await client.post(f"/admin/payouts/{payout.id}/mark-paid", headers=admin_headers, json={"reference": "UTR1"})
    assert blocked.status_code == 409 and "KYC" in blocked.json()["detail"]
    listed = (await client.get("/admin/payouts", headers=admin_headers)).json()
    assert listed[0]["host_kyc_status"] == "incomplete"

    await _complete_profile(client, host)
    await client.post(f"/admin/kyc/{host_id}/verify", headers=admin_headers)
    ok = await client.post(f"/admin/payouts/{payout.id}/mark-paid", headers=admin_headers, json={"reference": "UTR1"})
    assert ok.status_code == 200 and ok.json()["status"] == "paid"
