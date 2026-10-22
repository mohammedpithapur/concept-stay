import pytest

from app.config import settings
from app.services.experience_pricing import compute_experience_pricing
from tests.experience_helpers import h

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _rates(monkeypatch):
    monkeypatch.setattr(settings, "GUEST_SERVICE_FEE_PERCENT", 5)
    monkeypatch.setattr(settings, "TAX_PERCENT", 12)
    monkeypatch.setattr(settings, "EXPERIENCE_COMMISSION_PERCENT", 15)


def test_worked_example():
    assert compute_experience_pricing(2500, 2, 15) == {
        "value": 5000, "service_fee": 250, "taxes": 630, "total": 5880, "commission": 750, "operator_amount": 4250,
    }


def test_commission_never_exceeds_value():
    p = compute_experience_pricing(2500, 2, 100)
    assert p["commission"] == 5000
    assert p["operator_amount"] == 0


async def test_default_commission_is_config(client, admin_headers):
    res = await client.get("/admin/settings/experience-commission", headers=admin_headers)
    assert res.status_code == 200
    assert res.json() == {"percent": 15}


async def test_admin_sets_commission_and_non_admin_forbidden(client, admin_headers, user_headers):
    assert (await client.put("/admin/settings/experience-commission", headers=admin_headers, json={"percent": 20})).status_code == 200
    assert (await client.get("/admin/settings/experience-commission", headers=admin_headers)).json() == {"percent": 20}
    assert (await client.put("/admin/settings/experience-commission", headers=user_headers, json={"percent": 10})).status_code == 403
    assert (await client.put("/admin/settings/experience-commission", headers=admin_headers, json={"percent": 101})).status_code == 422
    assert (await client.get("/admin/settings/experience-commission", headers=user_headers)).status_code == 403
