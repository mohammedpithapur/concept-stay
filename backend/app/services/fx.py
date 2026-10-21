"""Currency conversion for international guests. Prices stay in rupees; only the gateway charge changes currency."""
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.fx_rate import FxRate

ONE = Decimal(1)


class UnsupportedCurrency(ValueError):
    pass


def is_supported(currency: str) -> bool:
    return currency in settings.SUPPORTED_CURRENCIES


async def get_rate(db: AsyncSession, currency: str) -> Decimal:
    """Units of `currency` per rupee. Raises UnsupportedCurrency when it is not offered or has no rate yet."""
    if currency == "INR":
        return ONE
    if not is_supported(currency):
        raise UnsupportedCurrency(f"{currency} payments are not supported")
    row = await db.get(FxRate, currency)
    if not row or row.rate_per_inr <= 0:
        raise UnsupportedCurrency(f"{currency} payments are not available right now")
    return Decimal(row.rate_per_inr)


def to_minor(inr_amount: int, rate: Decimal) -> int:
    """Rupees to minor units (cents, paise, ...) of the target currency, rounding half up. INR gives paise exactly."""
    return int((Decimal(inr_amount) * rate * 100).quantize(ONE, rounding=ROUND_HALF_UP))


def to_inr(minor: int, rate: Decimal) -> int:
    """Minor units of the target currency back to whole rupees, rounding half up."""
    return int((Decimal(minor) / (rate * 100)).quantize(ONE, rounding=ROUND_HALF_UP))
