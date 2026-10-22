"""Revenue per traveller: what Concept Stay earned (commission plus guest service fee) from each guest, stays and
experiences together. Voided payouts and refunded bookings earn nothing."""
from datetime import date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.experience import ExperienceBooking, ExperiencePayout
from app.models.payout import Payout
from app.models.user import User


def _created_window(column, date_from: date | None, date_to: date | None) -> list:
    clauses = []
    if date_from:
        clauses.append(column >= datetime.combine(date_from, time.min))
    if date_to:
        clauses.append(column < datetime.combine(date_to, time.min) + timedelta(days=1))
    return clauses


async def build_traveller_report(
    db: AsyncSession, date_from: date | None, date_to: date | None, limit: int, offset: int
) -> dict:
    stays = await db.execute(
        select(Booking.guest_id, func.sum(Payout.commission + Payout.fees))
        .join(Booking, Booking.id == Payout.booking_id)
        .where(Payout.status != "voided", *_created_window(Booking.created_at, date_from, date_to))
        .group_by(Booking.guest_id)
    )
    experiences = await db.execute(
        select(ExperienceBooking.guest_id, func.sum(ExperiencePayout.commission + ExperiencePayout.fees))
        .join(ExperienceBooking, ExperienceBooking.id == ExperiencePayout.booking_id)
        .where(
            ExperiencePayout.status != "voided",
            ExperienceBooking.status != "refunded",
            *_created_window(ExperienceBooking.created_at, date_from, date_to),
        )
        .group_by(ExperienceBooking.guest_id)
    )
    totals: dict[UUID, dict[str, int]] = {}
    for guest_id, amount in stays.all():
        totals.setdefault(guest_id, {"stay": 0, "experience": 0})["stay"] = int(amount or 0)
    for guest_id, amount in experiences.all():
        totals.setdefault(guest_id, {"stay": 0, "experience": 0})["experience"] = int(amount or 0)

    ranked = sorted(totals.items(), key=lambda kv: (-(kv[1]["stay"] + kv[1]["experience"]), str(kv[0])))
    page = ranked[offset: offset + limit]
    users = {}
    if page:
        users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_([g for g, _ in page])))).scalars()}
    return {
        "total": len(ranked),
        "items": [
            {
                "user_id": guest_id,
                "full_name": users[guest_id].full_name,
                "email": users[guest_id].email,
                "stay_revenue": amounts["stay"],
                "experience_revenue": amounts["experience"],
                "total_revenue": amounts["stay"] + amounts["experience"],
            }
            for guest_id, amounts in page
        ],
    }
