import json
from typing import Any
from pydantic import model_validator, field_validator, Field, AliasChoices
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    FRONTEND_BASE_URL: str = "http://localhost:3000"
    DATABASE_URL: str = Field(validation_alias=AliasChoices("DATABASE_URL", "TEST_DATABASE_URL"))

    # Access token - short-lived, sent in Authorization header
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 720

    # Refresh token - long-lived, stored in httpOnly cookie
    JWT_REFRESH_SECRET: str | None = None
    JWT_REFRESH_EXPIRE_DAYS: int = 7

    # Cookie settings
    COOKIE_SECURE: bool = False
    COOKIE_DOMAIN: str | None = None

    # Google OAuth - fill these in .env after creating credentials in Google Cloud Console
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/auth/callback/google"

    # Supabase Storage
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "property-images"
    SUPABASE_PRIVATE_BUCKET: str = "private-docs"  # KYC and guest IDs; never public, served by signed URL only
    FIELD_ENCRYPTION_KEY: str = ""  # Fernet key (python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    IMAGE_MAX_BYTES: int = 5 * 1024 * 1024

    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://172.28.104.24:3000"]
    SENTRY_DSN: str | None = None
    REDIS_URL: str | None = None
    RESEND_API_KEY: str | None = None
    RESEND_FROM_EMAIL: str = "Concept Stay <noreply@conceptstay.in>"
    ADMIN_EMAIL: str = "staysearthy@gmail.com"
    FAST2SMS_API_KEY: str | None = None

    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # Marketplace economics (percent, integer)
    PLATFORM_COMMISSION_PERCENT: int = 15  # taken from the host's stay value
    GUEST_SERVICE_FEE_PERCENT: int = 5     # added to the guest's total
    TAX_PERCENT: int = 12                  # tax on the stay value, collected for remittance

    # Web Push (VAPID) — generate keys with: python backend/generate_vapid.py
    VAPID_PUBLIC_KEY: str = "BBEvrlgw4jr6bqlZQOnvleXIfzbvVH9cc95CfV_1yTltNL5mHAFuI48Sn0PMMO84_hzG9mh0-akMvaOrvshL2dc"
    VAPID_PRIVATE_KEY: str = "EpU8uIDaX8g-etzbY5Ehlm5djZM4vAhYasKm4bs-tZo"
    VAPID_CONTACT_EMAIL: str = "staysearthy@gmail.com"

    model_config = {"env_file": ".env"}

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            if v.startswith("["):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def validate_production_settings(self):
        if not self.JWT_REFRESH_SECRET:
            self.JWT_REFRESH_SECRET = self.JWT_SECRET

        return self


settings = Settings()
