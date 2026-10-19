import pytest


pytestmark = pytest.mark.asyncio


async def test_register_and_login(client):
    payload = {"email": "newuser@example.com", "password": "TestPass123!", "full_name": "New User"}
    register = await client.post("/auth/register", json=payload)
    assert register.status_code == 200, register.text
    token = register.json().get("access_token")
    assert token, "Expected access token in register response"

    login = await client.post("/auth/login", json={"identifier": payload["email"], "password": payload["password"]})
    assert login.status_code == 200, login.text
    assert login.json().get("access_token"), "Expected access token in login response"


async def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "TestPass123!", "full_name": "Dup User"}
    first = await client.post("/auth/register", json=payload)
    assert first.status_code == 200, first.text

    second = await client.post("/auth/register", json=payload)
    assert second.status_code == 400
    assert second.json().get("detail") == "Email already registered"


async def test_login_invalid_credentials(client):
    await client.post(
        "/auth/register",
        json={"email": "badlogin@example.com", "password": "GoodPass123!", "full_name": "Bad Login"},
    )

    bad = await client.post("/auth/login", json={"identifier": "badlogin@example.com", "password": "WrongPass"})
    assert bad.status_code == 401
    assert bad.json().get("detail") == "Invalid email or password"
