"""Private Supabase Storage bucket for KYC and guest-ID documents. Files are only ever served via short-lived signed URLs."""
import hashlib
import hmac
import re
import time
from pathlib import Path
from uuid import uuid4

import httpx

from app.config import settings
from app.services.upload import UploadStorageError

_SAFE_EXT = re.compile(r"\.[A-Za-z0-9]{1,5}$")


def _local() -> bool:
    """Dev and staging without Supabase keep the files on local disk; production never does."""
    return not settings.SUPABASE_URL and settings.ENVIRONMENT.lower() not in ("production", "prod")


def _local_file(path: str) -> Path:
    root = Path(settings.LOCAL_PRIVATE_DIR).resolve()
    target = (root / path).resolve()
    if root not in target.parents:
        raise UploadStorageError("Invalid storage path")
    return target


def local_signature(path: str, exp: int) -> str:
    return hmac.new(settings.JWT_SECRET.encode(), f"{path}:{exp}".encode(), hashlib.sha256).hexdigest()


def _base() -> str:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise UploadStorageError("Supabase storage is not configured")
    return settings.SUPABASE_URL.rstrip("/")


def _headers(content_type: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}", "apikey": settings.SUPABASE_SERVICE_KEY}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


async def upload_private(prefix: str, filename: str, content: bytes, mime: str) -> str:
    """Store a file and return its storage path (not a URL). The uploaded name is never used in the path."""
    ext = _SAFE_EXT.search(filename or "")
    path = f"{prefix}/{uuid4()}{ext.group(0).lower() if ext else ''}"
    if _local():
        target = _local_file(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return path
    url = f"{_base()}/storage/v1/object/{settings.SUPABASE_PRIVATE_BUCKET}/{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, content=content, headers=_headers(mime))
    except httpx.HTTPError as exc:
        raise UploadStorageError(f"Failed to reach storage: {exc}") from exc
    if resp.status_code not in (200, 201):
        raise UploadStorageError(f"Storage upload failed ({resp.status_code})")
    return path


async def signed_url(path: str, expires_in: int = 300) -> str:
    if _local():
        exp = int(time.time()) + expires_in
        return f"{settings.API_PUBLIC_URL.rstrip('/')}/dev-private/{path}?exp={exp}&sig={local_signature(path, exp)}"
    url = f"{_base()}/storage/v1/object/sign/{settings.SUPABASE_PRIVATE_BUCKET}/{path}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={"expiresIn": expires_in}, headers=_headers("application/json"))
    except httpx.HTTPError as exc:
        raise UploadStorageError(f"Failed to reach storage: {exc}") from exc
    if resp.status_code != 200:
        raise UploadStorageError(f"Could not sign URL ({resp.status_code})")
    return f"{_base()}/storage/v1{resp.json()['signedURL']}"


async def delete_private(path: str) -> None:
    """Remove a file. Raises UploadStorageError when it could not be removed, so callers decide what to do."""
    if _local():
        _local_file(path).unlink(missing_ok=True)
        return
    url = f"{_base()}/storage/v1/object/{settings.SUPABASE_PRIVATE_BUCKET}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request("DELETE", url, json={"prefixes": [path]}, headers=_headers("application/json"))
    except httpx.HTTPError as exc:
        raise UploadStorageError(f"Failed to reach storage: {exc}") from exc
    if resp.status_code not in (200, 204):
        raise UploadStorageError(f"Storage delete failed ({resp.status_code})")
