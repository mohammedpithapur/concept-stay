"""Price breakdown for an experience booking. Same fee and tax rules as stays, commission on the experience value."""
from app.config import settings
from app.services.payouts import percent_of


def compute_experience_pricing(price_per_person: int, party_size: int, commission_percent: int) -> dict:
    value = price_per_person * party_size
    service_fee = percent_of(value, settings.GUEST_SERVICE_FEE_PERCENT)
    taxes = percent_of(value + service_fee, settings.TAX_PERCENT)
    commission = min(value, percent_of(value, commission_percent))
    return {
        "value": value,
        "service_fee": service_fee,
        "taxes": taxes,
        "total": value + service_fee + taxes,
        "commission": commission,
        "operator_amount": max(0, value - commission),
    }
