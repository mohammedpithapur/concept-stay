"""Behind Render's proxy request.client is an internal address that changes per request, so the limiter must key on
X-Forwarded-For. Only the last entry is trustworthy: the proxy appends it, earlier entries are client-supplied."""
import pytest
from starlette.requests import Request

from app.rate_limit import client_ip

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="session", autouse=True)
def _create_test_schema():
    """Override the conftest one: this module never opens a database."""


@pytest.fixture(autouse=True)
def _truncate_tables(_create_test_schema):
    """Override the conftest one: nothing to truncate."""


def _req(forwarded=None, peer="10.24.1.1"):
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 0), "method": "GET", "path": "/"})


async def test_uses_the_address_the_proxy_appended():
    assert client_ip(_req("203.0.113.7")) == "203.0.113.7"


async def test_a_forged_first_entry_does_not_change_the_key():
    assert client_ip(_req("1.2.3.4, 203.0.113.7")) == "203.0.113.7"
    assert client_ip(_req("9.9.9.9, 203.0.113.7")) == "203.0.113.7"


async def test_without_the_header_it_falls_back_to_the_peer_address():
    assert client_ip(_req(None, peer="127.0.0.1")) == "127.0.0.1"
    assert client_ip(_req("", peer="127.0.0.1")) == "127.0.0.1"
