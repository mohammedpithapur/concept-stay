"""Commission and host payout ledger."""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.booking import Booking
from app.models.payout import Payout
from app.models.property import Property


def percent_of(amount: int, percent: int) -> int:
    """Integer percentage, rounded half up."""
    percent = max(0, min(100, int(percent)))
    return (amount * percent + 50) // 100


def compute_split(booking: Booking) -> dict:
    stay_value = booking.base_price + booking.extra_guest_charge
    commission = percent_of(stay_value, settings.PLATFORM_COMMISSION_PERCENT)
    host_amount = max(0, stay_value + booking.pet_charge + booking.cleaning_fee - commission)
    return {
        "gross_amount": booking.total,
        "commission": commission,
        "fees": booking.service_fee,
        "taxes": booking.taxes,
        "host_amount": host_amount,
    }


async def create_payout_for_booking(db: AsyncSession, booking: Booking) -> Payout | None:
    """Idempotent: webhook and /payments/verify may both confirm a booking; only one ledger row results.

    Does not commit; call inside the same transaction that marks the booking paid.
    """
    if booking.is_shadow_block or booking.is_admin_block:
        return None
    prop = await db.get(Property, booking.property_id)
    if prop is None:
        return None
    stmt = (
        pg_insert(Payout)
        .values(booking_id=booking.id, host_id=prop.owner_id, status="owed", **compute_split(booking))
        .on_conflict_do_nothing(index_elements=["booking_id"])
    )
    await db.execute(stmt)
    return await db.scalar(select(Payout).where(Payout.booking_id == booking.id))
