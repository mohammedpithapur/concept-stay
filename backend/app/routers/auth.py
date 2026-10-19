import logging
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

logger = logging.getLogger("conceptstay.auth")

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.config import settings
from app.database import get_db, utc_now
from app.dependencies import get_current_user
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.user import RegisterIn, LoginIn, TokenOut, UserOut, ForgotPasswordIn, ResetPasswordIn, SendOtpIn, VerifyOtpIn
from app.services.auth import (
    hash_password, verify_password_async,
    create_access_token, create_refresh_token, decode_refresh_token,
    create_password_reset_token, hash_reset_token,
)
from app.services.email import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_MAX_AGE = settings.JWT_REFRESH_EXPIRE_DAYS * 24 * 60 * 60  # seconds


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Set the httpOnly refresh-token cookie — JS cannot read this.

    In production the frontend (Vercel) and backend (Railway/Render) are on
    different origins, so we MUST use SameSite=None + Secure so the browser
    includes the cookie on cross-origin /auth/refresh calls.
    In development we use SameSite=Lax (same-origin, no HTTPS needed).
    """
    is_production = settings.COOKIE_SECURE  # COOKIE_SECURE is True only in prod
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_production,
        samesite="none" if is_production else "lax",
        max_age=_COOKIE_MAX_AGE,
        domain=settings.COOKIE_DOMAIN,  # None → current domain only
        path="/auth",                    # Cookie is only sent to /auth/* routes
    )


def _clear_refresh_cookie(response: Response) -> None:
    is_production = settings.COOKIE_SECURE
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        secure=is_production,
        samesite="none" if is_production else "lax",
        max_age=0,
        domain=settings.COOKIE_DOMAIN,
        path="/auth",
    )


_OTP_STORE: dict[str, tuple[str, datetime]] = {}


@router.post("/send-verification-otp")
@limiter.limit("5/minute")
async def send_verification_otp(request: Request, data: SendOtpIn, db: AsyncSession = Depends(get_db)):
    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = utc_now() + timedelta(minutes=10)
    _OTP_STORE[data.email.lower()] = (code, expires_at)
    sent = await send_verification_otp_email(data.email, code)
    if not sent and settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=500, detail="Failed to send verification email")
    return {"message": "Verification code sent to your email."}


@router.post("/verify-email-otp", response_model=TokenOut)
@limiter.limit("10/minute")
async def verify_email_otp(request: Request, data: VerifyOtpIn, response: Response, db: AsyncSession = Depends(get_db)):
    email_key = data.email.lower()
    stored = _OTP_STORE.get(email_key)
    if not stored:
        raise HTTPException(status_code=400, detail="No verification code found. Please request a new one.")
    code, expires_at = stored
    if utc_now() > expires_at:
        _OTP_STORE.pop(email_key, None)
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")
    if data.code != code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    _OTP_STORE.pop(email_key, None)
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_email_verified = True
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user)
    _set_refresh_cookie(response, create_refresh_token(user))
    return {"access_token": access_token, "user": user}


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut)
@limiter.limit("10/minute")
async def register(request: Request, data: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        is_email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user)
    _set_refresh_cookie(response, create_refresh_token(user))
    return {"access_token": access_token, "user": user}


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    identifier = data.identifier.strip()

    # Detect if the identifier is a phone number (digits only, optionally starts with +)
    is_phone = identifier.replace("+", "").replace(" ", "").isdigit()

    if is_phone:
        result = await db.execute(select(User).where(User.phone == identifier))
    else:
        result = await db.execute(select(User).where(User.email == identifier.lower()))

    user = result.scalar_one_or_none()

    if not user:
        detail = "No account found with this phone number. Please sign up first." if is_phone else "No account found with this email. Please sign up or register first."
        raise HTTPException(status_code=404, detail=detail)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive.")

    if not await verify_password_async(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password. Please check your password or use 'Forgot Password'.")

    access_token = create_access_token(user)
    _set_refresh_cookie(response, create_refresh_token(user))
    return {"access_token": access_token, "user": user}


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """
    Silently issue a new access token using the httpOnly refresh cookie.
    Also rotates (replaces) the refresh token for rolling expiry.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    user_id = decode_refresh_token(token)
    if not user_id:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: issue brand-new refresh token (old one is implicitly abandoned)
    access_token = create_access_token(user)
    _set_refresh_cookie(response, create_refresh_token(user))
    return {"access_token": access_token, "user": user}


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie. Access token expires on its own."""
    _clear_refresh_cookie(response)
    return {"message": "Logged out successfully"}


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google/url")
async def google_auth_url(next: str = "/dashboard"):
    """
    Returns the Google OAuth consent URL for the frontend to redirect to.
    The `next` param is passed as OAuth `state` so we know where to send
    the user after successful auth.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=501,
            detail="Google OAuth is not configured. Add GOOGLE_CLIENT_ID to .env",
        )
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "scope": "openid email profile",
        "response_type": "code",
        "access_type": "offline",
        "prompt": "select_account",
        "state": next,
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"url": url}


@router.post("/google/callback", response_model=TokenOut)
async def google_callback(
    code: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Exchange the Google auth code for user info, then issue app tokens.
    Called by the frontend callback page.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    async with httpx.AsyncClient() as client:
        # Step 1: exchange code for Google access token
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if not token_res.is_success:
            raise HTTPException(status_code=400, detail="Failed to exchange Google auth code")

        google_tokens = token_res.json()

        # Step 2: fetch user info from Google
        userinfo_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {google_tokens['access_token']}"},
        )
        if not userinfo_res.is_success:
            raise HTTPException(status_code=400, detail="Failed to fetch Google user info")

        google_user = userinfo_res.json()

    email: str = google_user.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    # Step 3: find existing user or create one
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            # Random password — Google users authenticate via Google, not password
            password_hash=hash_password(secrets.token_urlsafe(32)),
            full_name=google_user.get("name") or email.split("@")[0],
            is_email_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    access_token = create_access_token(user)
    _set_refresh_cookie(response, create_refresh_token(user))
    return {"access_token": access_token, "user": user}


# ── Forgot / Reset Password ───────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user and user.is_active:
        sent_in_last_hour = await db.scalar(
            select(func.count()).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.created_at >= utc_now() - timedelta(hours=1),
            )
        )
        if sent_in_last_hour and sent_in_last_hour >= 3:
            return {"message": "If the email exists, a reset link has been sent."}

        token, token_hash, expires_at = create_password_reset_token()
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at,
            )
        )
        await db.commit()

        reset_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={token}"
        email_sent = await send_password_reset_email(user.email, reset_url)
        if not email_sent and settings.ENVIRONMENT != "development":
            raise HTTPException(status_code=503, detail="Password reset email is not configured")

    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordIn, response: Response, db: AsyncSession = Depends(get_db)):
    token_hash = hash_reset_token(data.token)
    result = await db.execute(
        select(PasswordResetToken, User)
        .join(User, User.id == PasswordResetToken.user_id)
        .where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.expires_at > utc_now(),
            PasswordResetToken.used_at.is_(None),
            User.is_active == True,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    reset_token, user = row
    user.password_hash = hash_password(data.new_password)
    reset_token.used_at = utc_now()
    await db.commit()
    _clear_refresh_cookie(response)
    return {"message": "Password has been reset."}
