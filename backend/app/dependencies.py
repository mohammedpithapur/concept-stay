from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import HostStatus, OperatorStatus, User, UserRole
from app.services.auth import get_user_from_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await get_user_from_token(credentials.credentials, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    return user


security_optional = HTTPBearer(auto_error=False)


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials or not credentials.credentials:
        return None
    try:
        user = await get_user_from_token(credentials.credentials, db)
        return user if user and user.is_active else None
    except Exception:
        return None


async def get_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_host(user: User = Depends(get_current_user)) -> User:
    """Approved hosts, plus admins (who own the legacy listings)."""
    if user.role == UserRole.admin:
        return user
    if user.role != UserRole.host or user.host_status != HostStatus.approved:
        raise HTTPException(status_code=403, detail="Approved host access required")
    return user


async def get_host_any_status(user: User = Depends(get_current_user)) -> User:
    """Any host (pending or suspended included) or admin: used by the profile pages a host fills before approval."""
    if user.role not in (UserRole.host, UserRole.admin):
        raise HTTPException(status_code=403, detail="Host access required")
    return user


async def get_operator(user: User = Depends(get_current_user)) -> User:
    """Approved operators, plus admins."""
    if user.role == UserRole.admin:
        return user
    if user.role != UserRole.operator or user.operator_status != OperatorStatus.approved:
        raise HTTPException(status_code=403, detail="Approved operator access required")
    return user


async def get_operator_any_status(user: User = Depends(get_current_user)) -> User:
    """Any operator (pending or suspended included) or admin: used by the profile pages filled before approval."""
    if user.role not in (UserRole.operator, UserRole.admin):
        raise HTTPException(status_code=403, detail="Operator access required")
    return user
