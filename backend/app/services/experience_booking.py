"""Slot availability rules shared by search, quotes and booking."""
from datetime import datetime, timedelta, timezone

from app.models.experience import ExperienceSlot

BOOKING_CUTOFF = timedelta(hours=1)  # booking closes this long before a slot starts


def seats_left(slot: ExperienceSlot) -> int:
    return max(0, slot.capacity - slot.seats_booked)


def slot_is_open(slot: ExperienceSlot, now: datetime | None = None) -> bool:
    """Time rule only: the slot starts more than BOOKING_CUTOFF from now. Compared in UTC; India time is display-only."""
    now = now or datetime.now(timezone.utc)
    return slot.starts_at - now > BOOKING_CUTOFF


def slot_is_bookable(slot: ExperienceSlot, now: datetime | None = None) -> bool:
    return slot_is_open(slot, now) and seats_left(slot) > 0
