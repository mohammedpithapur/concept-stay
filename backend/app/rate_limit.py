from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request) -> str:
    """Key rate limits by the caller's address.

    On Render every request arrives through Cloudflare and an internal proxy, so request.client is an internal address
    that changes per request (every visitor looked new and no limit ever fired) and the tail of X-Forwarded-For
    changes too. Cloudflare sets CF-Connecting-IP to the real caller itself, so a visitor cannot forge it, while
    X-Forwarded-For can start with anything they send. Without those headers (local runs) the peer address is used.
    """
    for name in ("cf-connecting-ip", "true-client-ip"):
        value = request.headers.get(name, "").strip()
        if value:
            return value
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
