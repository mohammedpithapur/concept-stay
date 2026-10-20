"""Field-level encryption for sensitive host data (PAN, bank account number)."""
import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


@lru_cache(maxsize=4)
def _fernet_for(key: str, jwt_secret: str, environment: str) -> Fernet:
    if key:
        return Fernet(key.encode())
    if environment.lower() in ("production", "prod"):
        raise RuntimeError("FIELD_ENCRYPTION_KEY must be set in production")
    # Development / staging only: derive a stable key so encrypted rows survive restarts.
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(jwt_secret.encode()).digest()))


def _fernet() -> Fernet:
    return _fernet_for(settings.FIELD_ENCRYPTION_KEY, settings.JWT_SECRET, settings.ENVIRONMENT)


def check_configured() -> None:
    """Called at startup so a missing production key fails the boot, not the first host save."""
    _fernet()


def encrypt_text(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_text(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored value cannot be decrypted with the current key") from exc


def mask_tail(value: str, keep: int = 4) -> str:
    """Mask all but the last `keep` characters: ABCDE1234F becomes ******234F. Short values are fully masked."""
    if len(value) <= keep:
        return "*" * len(value)
    return "*" * (len(value) - keep) + value[-keep:]
