"""Shared helpers for the local-experiences tests (not collected: no test_ prefix)."""


def h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def make_operator(client, admin_token, email: str) -> str:
    """Register a guest, apply to become an operator, get approved; return the access token."""
    reg = await client.post(
        "/auth/register",
        json={"email": email, "password": "OperatorPass123!", "full_name": email.split("@")[0]},
    )
    token = reg.json()["access_token"]
    res = await client.post("/auth/become-operator", headers=h(token))
    assert res.status_code == 200, res.text
    me = (await client.get("/auth/me", headers=h(token))).json()
    res = await client.patch(
        f"/admin/operators/{me['id']}", json={"operator_status": "approved"}, headers=h(admin_token)
    )
    assert res.status_code == 200, res.text
    return token


def experience_payload(**overrides) -> dict:
    base = {
        "title": "Sunrise trek",
        "description": "A guided walk to the ridge for sunrise.",
        "images": ["https://example.com/a.jpg"],
        "city": "Munnar",
        "state": "Kerala",
        "meeting_point": "Main gate, Tea Museum road",
        "category": "adventure",
        "duration_minutes": 180,
        "difficulty": "easy",
        "min_age": 8,
        "languages": ["English", "Malayalam"],
        "included": "Guide, snacks",
        "what_to_bring": "Comfortable shoes",
        "price_per_person": 2500,
    }
    base.update(overrides)
    return base


async def create_live_experience(client, op_token, admin_token, **overrides) -> str:
    """Operator creates a listing, admin approves it; returns the experience id."""
    create = await client.post("/operator/experiences", headers=h(op_token), json=experience_payload(**overrides))
    assert create.status_code == 200, create.text
    eid = create.json()["id"]
    approve = await client.post(f"/admin/experiences/{eid}/approve", headers=h(admin_token))
    assert approve.status_code == 200, approve.text
    return eid
