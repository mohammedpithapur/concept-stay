"""Behind Render (Cloudflare in front) request.client is an internal address that changes per request, and the tail of
X-Forwarded-For is a changing Cloudflare/internal address. Cloudflare sets CF-Connecting-IP to the real caller itself,
so a visitor cannot forge it; X-Forwarded-For can start with anything the visitor sends."""
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


def _req(peer="10.24.1.1", **headers):
    raw = [(k.replace("_", "-").encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw, "client": (peer, 0), "method": "GET", "path": "/"})


async def test_uses_the_address_cloudflare_reports():
    assert client_ip(_req(cf_connecting_ip="43.241.193.209")) == "43.241.193.209"


async def test_forged_forwarded_for_and_changing_proxy_hops_do_not_change_the_key():
    a = _req(peer="10.24.120.78", cf_connecting_ip="43.241.193.209",
             x_forwarded_for="1.2.3.4,43.241.193.209, 104.22.66.9, 10.24.120.78")
    b = _req(peer="10.29.232.5", cf_connecting_ip="43.241.193.209",
             x_forwarded_for="9.9.9.9,43.241.193.209, 172.71.202.14, 10.29.232.5")
    assert client_ip(a) == client_ip(b) == "43.241.193.209"


async def test_true_client_ip_is_the_fallback():
    assert client_ip(_req(true_client_ip="198.51.100.4")) == "198.51.100.4"


async def test_without_those_headers_it_falls_back_to_the_peer_address():
    assert client_ip(_req(peer="127.0.0.1")) == "127.0.0.1"
    assert client_ip(_req(peer="127.0.0.1", cf_connecting_ip="")) == "127.0.0.1"
