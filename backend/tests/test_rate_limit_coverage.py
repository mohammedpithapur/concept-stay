"""Endpoints that send email or accept anonymous input must be rate limited, or they can be scripted to flood inboxes."""
import pytest

from app.rate_limit import limiter
import app.routers.auth, app.routers.contact, app.routers.events  # noqa: F401  (registers the limits)

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="session", autouse=True)
def _create_test_schema():
    """Override the conftest one: this module never opens a database."""


@pytest.fixture(autouse=True)
def _truncate_tables(_create_test_schema):
    """Override the conftest one: nothing to truncate."""


@pytest.mark.parametrize("handler", [
    "app.routers.auth.forgot_password",
    "app.routers.auth.reset_password",
    "app.routers.contact.submit_contact",
    "app.routers.events.create_event_request",
])
async def test_public_mail_endpoints_are_rate_limited(handler):
    assert handler in limiter._route_limits, f"{handler} has no @limiter.limit"
