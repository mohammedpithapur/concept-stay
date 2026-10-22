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
