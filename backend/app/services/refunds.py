"""Thin wrapper over the Razorpay refund API (kept separate so it is easy to fake in tests)."""
from app.config import settings


class RefundError(Exception):
    pass


def get_razorpay_client():
    # Reuse the client factory in the payments router: it carries the pkg_resources shim the SDK needs.
    from app.routers.payments import _get_razorpay_client

    return _get_razorpay_client()


def issue_refund(razorpay_payment_id: str, amount_minor: int) -> None:
    """Refund `amount_minor` (minor units of the currency the guest paid in). Blocking: run in a thread.

    Raises RefundError on any gateway problem."""
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise RefundError("Payment gateway not configured")
    if not razorpay_payment_id:
        raise RefundError("No Razorpay payment ID recorded for this booking")
    try:
        get_razorpay_client().payment.refund(
            razorpay_payment_id, {"amount": amount_minor, "speed": "normal"}
        )
    except Exception as exc:  # the SDK raises assorted error types
        raise RefundError(str(exc)) from exc
