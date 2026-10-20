"""Validation shared by every private-document upload (host KYC, guest ID)."""
from fastapi import HTTPException, UploadFile

MAX_DOC_BYTES = 8 * 1024 * 1024

# declared mime -> the file signature it must start with (webp is checked separately: RIFF....WEBP)
_SIGNATURES = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "application/pdf": b"%PDF",
}


def _matches(mime: str, content: bytes) -> bool:
    if mime == "image/webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    sig = _SIGNATURES.get(mime)
    return bool(sig) and content.startswith(sig)


async def read_validated_upload(file: UploadFile, max_bytes: int = MAX_DOC_BYTES) -> tuple[bytes, str]:
    """Return (content, mime). 422 when the type is not allowed or does not match the bytes, 413 when too large."""
    mime = (file.content_type or "").lower()
    if mime not in _SIGNATURES and mime != "image/webp":
        raise HTTPException(status_code=422, detail="Upload a JPEG, PNG, WebP or PDF file")
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File is larger than {max_bytes // (1024 * 1024)} MB")
    if not content or not _matches(mime, content):
        raise HTTPException(status_code=422, detail="The file content does not match its type")
    return content, mime
