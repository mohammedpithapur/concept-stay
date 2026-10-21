from datetime import datetime, timedelta
import asyncio
import secrets
import uuid

import bcrypt
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.user import User
from app.database import utc_now
from app.services.cache import cache_get_json, cache_set_json


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


async def verify_password_async(plain: str, hashed: str) -> bool:
    return await asyncio.to_thread(verify_password, plain, hashed)


def hash_reset_token(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode()).hexdigest()


def create_password_reset_token() -> tuple[str, str, datetime]:
    token = secrets.token_urlsafe(32)
    return token, hash_reset_token(token), utc_now() + timedelta(minutes=15)


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "password_hash": user.password_hash,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.value,
        "host_status": user.host_status.value,
        "is_active": user.is_active,
        "is_email_verified": user.is_email_verified,
        "open_to_connections": user.open_to_connections,
        "created_at": user.created_at.isoformat(),
    }


def _deserialize_user(data: dict) -> User:
    from app.models.user import HostStatus, UserRole

    return User(
        id=uuid.UUID(data["id"]),
        email=data["email"],
        password_hash=data["password_hash"],
        full_name=data["full_name"],
        phone=data.get("phone"),
        role=UserRole(data["role"]),
        host_status=HostStatus(data.get("host_status", "approved")),
        is_active=data["is_active"],
        is_email_verified=data["is_email_verified"],
        open_to_connections=data.get("open_to_connections", False),
        created_at=datetime.fromisoformat(data["created_at"]),
    )


def create_access_token(user: User) -> str:
    """Short-lived JWT (20 min) sent in Authorization header."""
    expire = utc_now() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


# Backward-compat alias used by existing code
create_token = create_access_token


def create_refresh_token(user: User) -> str:
    """Long-lived JWT (7 days) stored in httpOnly cookie.
    Uses a *different* secret so a leaked access token cannot forge a refresh token.
    """
    expire = utc_now() + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)
    payload = {
        "sub": str(user.id),
        "exp": expire,
        "type": "refresh",
        # jti provides a unique ID; can be stored in a blocklist for revocation
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.JWT_REFRESH_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_refresh_token(token: str) -> str | None:
    """Returns user_id (str) if token is valid, else None."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_REFRESH_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None


async def get_user_from_token(token_str: str, db: AsyncSession) -> User | None:
    try:
        payload = jwt.decode(
            token_str,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id = payload.get("sub")
        if not user_id:
            return None
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (JWTError, ValueError):
        return None

    cache_key = f"user:{user_id}"
    cached = await cache_get_json(cache_key)
    if cached:
        return _deserialize_user(cached)

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user:
        await cache_set_json(cache_key, _serialize_user(user), ttl_seconds=60)
    return user
