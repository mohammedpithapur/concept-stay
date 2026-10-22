"""Public experience browsing and quotes."""
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import IST, get_db
from app.models.experience import Experience, ExperienceSlot
from app.models.user import OperatorStatus, User
from app.schemas.experience import (
    ExperienceListOut, PublicExperienceDetail, PublicExperienceOut, QuoteIn, SlotPublic,
)
from app.services.app_settings import get_commission_percent
from app.services.experience_booking import BOOKING_CUTOFF, seats_left, slot_is_open
from app.services.experience_pricing import compute_experience_pricing
from app.services.fx import UnsupportedCurrency, get_rate, to_minor

router = APIRouter(prefix="/experiences", tags=["experiences"])

Category = Literal["adventure", "food", "culture", "wellness", "nature", "local_transport", "other"]


def _bookable_slot_clause(now: datetime):
    return (
        ExperienceSlot.starts_at > now + BOOKING_CUTOFF,
        ExperienceSlot.seats_booked < ExperienceSlot.capacity,
    )


def _public_clauses():
    return (
        Experience.approval_status == "approved",
        Experience.is_published.is_(True),
        User.operator_status == OperatorStatus.approved,
    )


@router.get("", response_model=ExperienceListOut)
async def list_experiences(
    city: str | None = None,
    state: str | None = None,
    category: Category | None = None,
    date_: date | None = Query(None, alias="date"),
    max_price: int | None = Query(None, ge=0),
    sort: Literal["newest", "price_asc", "price_desc"] = "newest",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    slot_filters = list(_bookable_slot_clause(now))
    if date_:
        day_start = datetime.combine(date_, time.min, tzinfo=IST)
        slot_filters += [ExperienceSlot.starts_at >= day_start, ExperienceSlot.starts_at < day_start + timedelta(days=1)]
    has_slot = (
        select(ExperienceSlot.id).where(ExperienceSlot.experience_id == Experience.id, *slot_filters).exists()
    )
    conditions = [*_public_clauses(), has_slot]
    if city:
        conditions.append(func.lower(Experience.city) == city.lower())
    if state:
        conditions.append(func.lower(Experience.state) == state.lower())
    if category:
        conditions.append(Experience.category == category)
    if max_price is not None:
        conditions.append(Experience.price_per_person <= max_price)

    base = select(Experience).join(User, User.id == Experience.operator_id).where(*conditions)
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    order = {
        "newest": Experience.created_at.desc(),
        "price_asc": Experience.price_per_person.asc(),
        "price_desc": Experience.price_per_person.desc(),
    }[sort]
    rows = (await db.execute(base.order_by(order, Experience.id).limit(limit).offset(offset))).scalars().all()

    next_slots = {}
    if rows:
        found = await db.execute(
            select(ExperienceSlot.experience_id, func.min(ExperienceSlot.starts_at))
            .where(ExperienceSlot.experience_id.in_([e.id for e in rows]), *_bookable_slot_clause(now))
            .group_by(ExperienceSlot.experience_id)
        )
        next_slots = dict(found.all())
    items = []
    for exp in rows:
        out = PublicExperienceOut.model_validate(exp)
        out.next_slot_at = next_slots.get(exp.id)
        items.append(out)
    return ExperienceListOut(items=items, total=total or 0)


async def _visible_experience(db: AsyncSession, experience_id: uuid.UUID) -> Experience:
    row = (
        await db.execute(
            select(Experience)
            .join(User, User.id == Experience.operator_id)
            .where(Experience.id == experience_id, *_public_clauses())
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Experience not found")
    return row


@router.get("/{experience_id}", response_model=PublicExperienceDetail)
async def get_experience(experience_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    exp = await _visible_experience(db, experience_id)
    now = datetime.now(timezone.utc)
    slots = (
        await db.execute(
            select(ExperienceSlot)
            .where(ExperienceSlot.experience_id == exp.id, *_bookable_slot_clause(now))
            .order_by(ExperienceSlot.starts_at)
        )
    ).scalars().all()
    out = PublicExperienceDetail.model_validate({**PublicExperienceOut.model_validate(exp).model_dump(), "slots": []})
    out.slots = [
        SlotPublic(id=s.id, starts_at=s.starts_at, capacity=s.capacity, seats_left=seats_left(s)) for s in slots
    ]
    out.next_slot_at = slots[0].starts_at if slots else None
    return out


@router.post("/{experience_id}/quote")
async def quote_experience(experience_id: uuid.UUID, data: QuoteIn, db: AsyncSession = Depends(get_db)):
    exp = await _visible_experience(db, experience_id)
    slot = await db.get(ExperienceSlot, data.slot_id)
    if not slot or slot.experience_id != exp.id:
        raise HTTPException(status_code=404, detail="Slot not found")
    if not slot_is_open(slot):
        raise HTTPException(status_code=422, detail="Booking for this slot has closed")
    if data.party_size > seats_left(slot):
        raise HTTPException(status_code=409, detail=f"Only {seats_left(slot)} seats left")
    currency = data.currency.upper()
    try:
        rate = await get_rate(db, currency)
    except UnsupportedCurrency as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    pricing = compute_experience_pricing(exp.price_per_person, data.party_size, await get_commission_percent(db))
    return {
        "price_per_person": exp.price_per_person,
        "party_size": data.party_size,
        "value": pricing["value"],
        "service_fee": pricing["service_fee"],
        "taxes": pricing["taxes"],
        "total": pricing["total"],
        "charged": {"currency": currency, "amount_minor": to_minor(pricing["total"], rate)},
    }
