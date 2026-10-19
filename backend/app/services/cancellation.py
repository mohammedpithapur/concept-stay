"""Cancellation policies: how much of a paid booking is refunded, and what that does to the host payout."""
from datetime import date

from app.models.payout import Payout

# policy -> [(minimum days before check-in, refund percent), ...] checked top to bottom
POLICY_TIERS: dict[str, list[tuple[int, int]]] = {
    "flexible": [(5, 100)],
    "moderate": [(14, 100), (5, 50)],
    "non_refundable": [],
}


def compute_refund(policy: str, total_paid: int, check_in: date, today: date) -> int:
    """Refund in whole rupees. Unknown policies are treated as non-refundable; on/after check-in nothing is refunded."""
    days_before = (check_in - today).days
    if days_before <= 0:
        return 0
    for min_days, percent in POLICY_TIERS.get(policy, []):
        if days_before >= min_days:
            return (total_paid * percent) // 100
    return 0


def rescale_payout(payout: Payout, total_paid: int, refund_amount: int) -> None:
    """Shrink an owed payout to the share of the booking the platform kept. Voids it on a full refund."""
    if payout.status != "owed" or refund_amount <= 0:
        return
    retained = total_paid - refund_amount
    if retained <= 0:
        payout.status = "voided"
        payout.gross_amount = payout.commission = payout.fees = payout.taxes = payout.host_amount = 0
        return
    commission = (payout.commission * retained + total_paid // 2) // total_paid
    fees = (payout.fees * retained + total_paid // 2) // total_paid
    taxes = (payout.taxes * retained + total_paid // 2) // total_paid
    payout.gross_amount = retained
    payout.commission, payout.fees, payout.taxes = commission, fees, taxes
    payout.host_amount = max(0, retained - commission - fees - taxes)
