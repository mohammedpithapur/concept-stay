import logging

from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request) -> str:
    """Key rate limits by the caller's address.

    Behind a proxy (Render) request.client is an internal address that changes per request, so every visitor looked
    like a new one and no limit ever fired. The proxy appends the caller's address to X-Forwarded-For; only that last
    entry is trustworthy, earlier ones are client-supplied and can be forged. Without the header (local runs) the
    peer address is used.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    logging.getLogger("conceptstay.api").info("RLDIAG xff=%r peer=%r cf=%r tci=%r", forwarded, request.client.host if request.client else None, request.headers.get("cf-connecting-ip"), request.headers.get("true-client-ip"))  # TEMPORARY diagnostic
    last = forwarded.split(",")[-1].strip() if forwarded else ""
    return last or get_remote_address(request)


limiter = Limiter(key_func=client_ip)
