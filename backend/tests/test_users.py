import pytest


pytestmark = pytest.mark.asyncio


async def test_me_requires_auth(client):
    response = await client.get("/auth/me")
    assert response.status_code in {401, 403}


async def test_me_returns_profile(client, user_headers):
    response = await client.get("/auth/me", headers=user_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["email"] == "guest@example.com"


async def test_update_profile(client, user_headers):
    response = await client.patch("/users/profile", headers=user_headers, json={"full_name": "Updated User"})
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Updated User"


async def test_change_password(client, user_headers):
    response = await client.patch(
        "/users/password",
        headers=user_headers,
        json={"old_password": "GuestPass123!", "new_password": "NewGuestPass123!"},
    )
    assert response.status_code == 200, response.text

    login = await client.post("/auth/login", json={"identifier": "guest@example.com", "password": "NewGuestPass123!"})
    assert login.status_code == 200, login.text


async def test_dashboard_metrics(client, user_headers):
    response = await client.get("/users/dashboard", headers=user_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "upcoming_bookings" in payload
    assert "past_stays" in payload
    assert "total_spent" in payload
    assert payload["profile"]["email"] == "guest@example.com"
