"""Dev and staging only: serves files the local private-storage fallback wrote, behind the same short-lived signed links."""
import hmac
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services import private_storage
from app.services.upload import UploadStorageError

router = APIRouter(tags=["dev-private"])


@router.get("/dev-private/{path:path}", include_in_schema=False)
async def get_private_file(path: str, exp: int, sig: str):
    if not private_storage._local():
        raise HTTPException(status_code=404, detail="Not found")
    if exp < time.time() or not hmac.compare_digest(sig, private_storage.local_signature(path, exp)):
        raise HTTPException(status_code=403, detail="Link expired or invalid")
    try:
        target = private_storage._local_file(path)
    except UploadStorageError:
        raise HTTPException(status_code=404, detail="Not found")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(target)
