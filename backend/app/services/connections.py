"""Join-in rules: who can see whom. Everything privacy-related lives here so the router stays thin."""
from datetime import date, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.connection import Connection
from app.models.user import User

# Single-unit stays never overlap, so "around the same time" includes guests who arrive up to this
# many days after (or leave up to this many days before) the viewer's stay.
WINDOW_DAYS = 2
# Requests stay possible for a week after the viewer's check-out.
REQUEST_GRACE_DAYS = 7

# The pair has a row but it is not an open door: neither side should see the other again.
_HIDDEN = ("declined", "blocked")


def first_name(full_name: str) -> str:
    parts = (full_name or "").split()
    return parts[0] if parts else "Guest"


def is_eligible_stay(booking: Booking) -> bool:
    return (
        not booking.is_admin_block
        and not booking.is_shadow_block
        and booking.payment_status == PaymentStatus.paid
        and booking.status in (BookingStatus.confirmed, BookingStatus.completed)
    )


def request_window_open(booking: Booking, today: date) -> bool:
    return today <= booking.check_out + timedelta(days=REQUEST_GRACE_DAYS)


async def co_guest_rows(db: AsyncSession, booking: Booking) -> list[tuple[User, Booking]]:
    """Opted-in guests with a paid stay at the same property around the same time. No contact fields are read."""
    window = timedelta(days=WINDOW_DAYS)
    hidden_pair = (
        select(Connection.id)
        .where(
            Connection.status.in_(_HIDDEN),
            or_(
                and_(Connection.requester_id == booking.guest_id, Connection.addressee_id == Booking.guest_id),
                and_(Connection.requester_id == Booking.guest_id, Connection.addressee_id == booking.guest_id),
            ),
        )
        .exists()
    )
    rows = (
        await db.execute(
            select(User, Booking)
            .join(Booking, Booking.guest_id == User.id)
            .where(
                Booking.property_id == booking.property_id,
                Booking.guest_id != booking.guest_id,
                Booking.is_admin_block == False,  # noqa: E712
                Booking.is_shadow_block == False,  # noqa: E712
                Booking.payment_status == PaymentStatus.paid,
                Booking.status.in_((BookingStatus.confirmed, BookingStatus.completed)),
                Booking.check_in <= booking.check_out + window,
                Booking.check_out >= booking.check_in - window,
                User.open_to_connections == True,  # noqa: E712
                User.is_active == True,  # noqa: E712
                ~hidden_pair,
            )
            .order_by(Booking.check_in)
        )
    ).all()
    seen: set = set()
    unique: list[tuple[User, Booking]] = []
    for user, stay in rows:  # a guest with several qualifying stays is listed once
        if user.id not in seen:
            seen.add(user.id)
            unique.append((user, stay))
    return unique


async def pair_connection(db: AsyncSession, a, b) -> Connection | None:
    return await db.scalar(
        select(Connection).where(
            or_(
                and_(Connection.requester_id == a, Connection.addressee_id == b),
                and_(Connection.requester_id == b, Connection.addressee_id == a),
            )
        )
    )


def connection_status_for(conn: Connection | None, viewer_id) -> str:
    if not conn:
        return "none"
    if conn.status == "pending":
        return "pending_out" if conn.requester_id == viewer_id else "pending_in"
    return conn.status
