from fastapi import APIRouter, Depends

from app.dependencies import get_host
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/host", tags=["host"])


@router.get("/me", response_model=UserOut)
async def host_me(host: User = Depends(get_host)):
    return host
