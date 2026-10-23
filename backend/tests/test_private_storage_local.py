"""Without Supabase, dev and staging keep private documents on local disk behind signed links."""
import time

import pytest

from app.config import settings
from app.services import private_storage

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _local_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    monkeypatch.setattr(settings, "LOCAL_PRIVATE_DIR", str(tmp_path))


async def test_upload_then_signed_link_serves_the_file(client):
    path = await private_storage.upload_private("host-kyc/u1", "pan.pdf", b"%PDF-1.4 hi", "application/pdf")
    url = await private_storage.signed_url(path, 300)
    assert url.startswith(settings.API_PUBLIC_URL)
    res = await client.get(url.replace(settings.API_PUBLIC_URL, ""))
    assert res.status_code == 200 and res.content == b"%PDF-1.4 hi"
    await private_storage.delete_private(path)
    assert (await client.get(url.replace(settings.API_PUBLIC_URL, ""))).status_code == 404


async def test_tampered_or_expired_link_is_refused(client):
    path = await private_storage.upload_private("host-kyc/u1", "id.pdf", b"x", "application/pdf")
    exp = int(time.time()) + 300
    bad = await client.get(f"/dev-private/{path}?exp={exp}&sig=deadbeef")
    assert bad.status_code == 403
    old = int(time.time()) - 5
    expired = await client.get(f"/dev-private/{path}?exp={old}&sig={private_storage.local_signature(path, old)}")
    assert expired.status_code == 403


async def test_production_never_uses_local_disk(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(Exception):
        await private_storage.upload_private("host-kyc/u1", "a.pdf", b"x", "application/pdf")
