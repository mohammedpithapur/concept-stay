import pytest
from uuid import UUID
from sqlalchemy import select

from app.models.password_reset import PasswordResetToken
from app.services.auth import hash_reset_token


pytestmark = pytest.mark.asyncio


async def test_forgot_password_does_not_enumerate_users(client):
    response = await client.post("/auth/forgot-password", json={"email": "missing@example.com"})

    assert response.status_code == 200
    assert response.json()["message"] == "If the email exists, a reset link has been sent."


async def test_password_reset_happy_path_and_one_time_use(client, db_session):
    email = "reset@example.com"
    old_password = "OldPass123!"
    new_password = "NewPass123!"

    register = await client.post(
        "/auth/register",
        json={"email": email, "password": old_password, "full_name": "Reset User"},
    )
    assert register.status_code == 200, register.text

    forgot = await client.post("/auth/forgot-password", json={"email": email})
    assert forgot.status_code == 200, forgot.text

    token_row = await db_session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.user_id == UUID(register.json()["user"]["id"]))
    )
    assert token_row is not None

    reset = await client.post(
        "/auth/reset-password",
        json={"token": "not-the-token", "new_password": new_password},
    )
    assert reset.status_code == 400

    # The raw token is only sent by email, so test the verification path by
    # replacing the stored hash with a known token hash.
    raw_token = "test-reset-token"
    token_row.token_hash = hash_reset_token(raw_token)
    await db_session.commit()

    reset = await client.post(
        "/auth/reset-password",
        json={"token": raw_token, "new_password": new_password},
    )
    assert reset.status_code == 200, reset.text

    old_login = await client.post("/auth/login", json={"identifier": email, "password": old_password})
    assert old_login.status_code == 401

    new_login = await client.post("/auth/login", json={"identifier": email, "password": new_password})
    assert new_login.status_code == 200, new_login.text

    reuse = await client.post(
        "/auth/reset-password",
        json={"token": raw_token, "new_password": "AnotherPass123!"},
    )
    assert reuse.status_code == 400
