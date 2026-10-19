from datetime import date, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingStatus
from app.models.property import Property
from app.config import settings
from app.models.property_group import PropertyGroupMember
from app.services.payouts import percent_of


def calculate_pricing(
    property: Property,
    check_in: date,
    check_out: date,
    pets: int,
    guests: int = 1,
    price_overrides: list[Any] | None = None,
) -> dict:
    nights_diff = check_out - check_in
    nights = max(0, nights_diff.days)

    base_price = 0
    nightly_rates = []
    default_price = property.price_per_night

    for i in range(nights):
        night_date = check_in + timedelta(days=i)
        matched_override = None
        if price_overrides:
            for ov in price_overrides:
                if ov.start_date <= night_date < ov.end_date:
                    matched_override = ov
                    break

        night_rate = matched_override.price_per_night if matched_override else default_price
        base_price += night_rate
        nightly_rates.append({
            "date": night_date.isoformat(),
            "price": night_rate,
            "original_price": default_price,
            "is_override": matched_override is not None,
            "discount_percent": getattr(matched_override, "discount_percent", None) if matched_override else None,
            "label": getattr(matched_override, "label", None) if matched_override else None,
        })

    base_guests = getattr(property, "base_guests", 2) or 2
    extra_guest_rate = getattr(property, "extra_guest_charge_per_night", 0) or 0
    extra_guests = max(0, guests - base_guests)
    extra_guest_charge = extra_guests * nights * extra_guest_rate
    pet_charge = pets * nights * property.pet_charge_per_night
    stay_value = base_price + extra_guest_charge
    taxes = percent_of(stay_value, settings.TAX_PERCENT)
    service_fee = percent_of(stay_value, settings.GUEST_SERVICE_FEE_PERCENT)
    total = stay_value + property.cleaning_fee + pet_charge + taxes + service_fee
    return {
        "nights": nights,
        "base_price": base_price,
        "extra_guest_charge": extra_guest_charge,
        "taxes": taxes,
        "service_fee": service_fee,
        "cleaning_fee": property.cleaning_fee,
        "pet_charge": pet_charge,
        "total": total,
        "nightly_rates": nightly_rates,
    }


async def apply_group_blocking(db: AsyncSession, booking: Booking, commit: bool = True) -> None:
    if booking.is_shadow_block:
        return

    member = await db.scalar(
        select(PropertyGroupMember).where(PropertyGroupMember.property_id == booking.property_id)
    )
    if not member:
        return

    if member.is_whole_property:
        target_query = select(PropertyGroupMember).where(
            PropertyGroupMember.group_id == member.group_id,
            PropertyGroupMember.is_whole_property == False,
        )
    else:
        target_query = select(PropertyGroupMember).where(
            PropertyGroupMember.group_id == member.group_id,
            PropertyGroupMember.is_whole_property == True,
        )

    result = await db.execute(target_query)
    targets = result.scalars().all()
    if not targets:
        return

    for target in targets:
        if target.property_id == booking.property_id:
            continue
        shadow = Booking(
            property_id=target.property_id,
            guest_id=booking.guest_id,
            check_in=booking.check_in,
            check_out=booking.check_out,
            guests=booking.guests,
            pets=booking.pets,
            nights=booking.nights,
            base_price=0,
            cleaning_fee=0,
            pet_charge=0,
            total=0,
            status=BookingStatus.confirmed,
            guest_name=booking.guest_name,
            guest_email=booking.guest_email,
            guest_phone=booking.guest_phone,
            is_shadow_block=True,
            parent_booking_id=booking.id,
        )
        db.add(shadow)

    if commit:
        await db.commit()


async def remove_shadow_blocks(db: AsyncSession, booking: Booking, commit: bool = True) -> None:
    if booking.is_shadow_block:
        return

    await db.execute(
        delete(Booking).where(Booking.parent_booking_id == booking.id)
    )
    if commit:
        await db.commit()


import time

_last_cleanup_time = 0.0
CLEANUP_INTERVAL = 60.0  # seconds (run at most once per minute)


async def auto_cleanup_expired_bookings(db: AsyncSession) -> None:
    """
    Finds and deletes any pending bookings that were created more than 15 minutes ago.
    Uses database-level ON DELETE CASCADE to clean up shadow blocks and payments in one roundtrip.
    Throttled to run at most once every 60 seconds to avoid DB query overhead on every request.
    """
    global _last_cleanup_time
    now = time.time()
    if now - _last_cleanup_time < CLEANUP_INTERVAL:
        return

    _last_cleanup_time = now

    from datetime import timedelta
    from app.database import utc_now

    limit = utc_now() - timedelta(minutes=15)
    result = await db.execute(
        delete(Booking).where(
            Booking.status == BookingStatus.pending,
            Booking.created_at < limit,
            Booking.is_admin_block == False,  # Never auto-expire admin blocks
        )
    )
    if result.rowcount > 0:
        await db.commit()