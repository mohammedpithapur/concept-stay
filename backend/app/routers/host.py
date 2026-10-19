import uuid
from calendar import monthrange
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db, today_ist
from app.dependencies import get_host
from app.models.payout import Payout
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.property import Property
from app.models.user import User, UserRole
from app.schemas.booking import AdminBlockCreate, BookingListOut, BookingOut, CalendarEventOut, CalendarOut
from app.schemas.property import HostPropertyOut, PropertyCreate, PropertyUpdate
from app.routers.admin import PresignedBatchRequest
from app.schemas.user import UserOut
from app.routers import admin as admin_router
from app.services.cache import invalidate_properties_cache
from app.services.listing_review import HOST_FORBIDDEN_FIELDS
from app.services.property_images import normalize_property_images, sync_property_images

router = APIRouter(prefix="/host", tags=["host"])

_NON_LIVE = ("draft", "pending_review", "rejected")


@router.get("/me", response_model=UserOut)
async def host_me(host: User = Depends(get_host)):
    return host


async def _load_owned(property_id: str, host: User, db: AsyncSession) -> Property:
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")
    result = await db.execute(
        select(Property).options(selectinload(Property.images)).where(Property.id == prop_uuid)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.owner_id != host.id and host.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="You do not own this property")
    return prop


# ── Listings ─────────────────────────────────────────────────────────────────

@router.get("/properties", response_model=list[HostPropertyOut])
async def list_my_properties(host: User = Depends(get_host), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.owner_id == host.id)
        .order_by(Property.created_at.desc())
    )
    return result.scalars().all()


@router.post("/properties", response_model=HostPropertyOut)
async def create_my_property(
    data: PropertyCreate, host: User = Depends(get_host), db: AsyncSession = Depends(get_db)
):
    images = await normalize_property_images(data.images)
    spaces = data.spaces_detail
    values = data.model_dump(exclude={"images", "spaces_detail"} | HOST_FORBIDDEN_FIELDS)
    values["amenities"] = [a for a in values.get("amenities", []) if isinstance(a, str) and not a.startswith(("__space__:", "{"))]
    prop = Property(
        owner_id=host.id, is_published=False, is_featured=False, approval_status="pending_review", **values
    )
    if spaces:
        prop.spaces_detail = spaces
    db.add(prop)
    await db.flush()
    await sync_property_images(db, prop.id, images)
    await db.commit()
    await invalidate_properties_cache()
    return await _load_owned(str(prop.id), host, db)


@router.patch("/properties/{property_id}", response_model=HostPropertyOut)
async def edit_my_property(
    property_id: str,
    data: PropertyUpdate,
    host: User = Depends(get_host),
    db: AsyncSession = Depends(get_db),
):
    prop = await _load_owned(property_id, host, db)
    changes = data.model_dump(exclude_unset=True, exclude={"images"} | HOST_FORBIDDEN_FIELDS)
    images = await normalize_property_images(data.images)
    if images is not None:
        changes["images"] = [img.model_dump() for img in images]
    if not changes:
        return prop

    if prop.approval_status in _NON_LIVE:
        # Not live yet: edit in place and (re)submit for review.
        spaces = changes.pop("spaces_detail", None)
        changes.pop("images", None)
        for key, value in changes.items():
            setattr(prop, key, value)
        if spaces is not None:
            prop.spaces_detail = spaces
        if images is not None:
            await sync_property_images(db, prop.id, images)
        prop.approval_status = "pending_review"
        prop.rejection_reason = None
    else:
        # Live listing: guests keep seeing the approved version until an admin approves.
        prop.pending_changes = {**(prop.pending_changes or {}), **changes}
        prop.rejection_reason = None
    await db.commit()
    await invalidate_properties_cache()
    return await _load_owned(property_id, host, db)


# ── Calendar (reuses the admin implementation after an ownership check) ──────

@router.get("/properties/{property_id}/calendar", response_model=CalendarOut)
async def my_property_calendar(
    property_id: str,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    host: User = Depends(get_host),
    db: AsyncSession = Depends(get_db),
):
    await _load_owned(property_id, host, db)
    return await admin_router.get_property_calendar(
        property_id=property_id, from_date=from_date, to_date=to_date, admin=host, db=db
    )


@router.post("/properties/{property_id}/blocks", response_model=CalendarEventOut, status_code=201)
async def create_my_block(
    property_id: str,
    data: AdminBlockCreate,
    host: User = Depends(get_host),
    db: AsyncSession = Depends(get_db),
):
    await _load_owned(property_id, host, db)
    return await admin_router.create_admin_block(property_id=property_id, data=data, admin=host, db=db)


@router.delete("/properties/{property_id}/blocks/{block_id}")
async def delete_my_block(
    property_id: str,
    block_id: str,
    host: User = Depends(get_host),
    db: AsyncSession = Depends(get_db),
):
    await _load_owned(property_id, host, db)
    return await admin_router.delete_admin_block(property_id=property_id, block_id=block_id, admin=host, db=db)


# ── Bookings & dashboard ─────────────────────────────────────────────────────

def _host_bookings_query(host: User):
    return (
        select(Booking)
        .join(Property, Property.id == Booking.property_id)
        .where(
            Property.owner_id == host.id,
            Booking.is_shadow_block == False,  # noqa: E712
            Booking.is_admin_block == False,  # noqa: E712
            Booking.status != BookingStatus.pending,
        )
    )


@router.get("/bookings", response_model=BookingListOut)
async def my_bookings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    host: User = Depends(get_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _host_bookings_query(host).order_by(Booking.check_in.desc()).offset((page - 1) * limit).limit(limit)
    )
    items = result.scalars().all()
    total = await db.scalar(select(func.count()).select_from(_host_bookings_query(host).subquery()))
    return BookingListOut(items=[BookingOut.model_validate(b) for b in items], total=total, page=page, limit=limit)


@router.get("/dashboard")
async def my_dashboard(host: User = Depends(get_host), db: AsyncSession = Depends(get_db)):
    today = today_ist()
    month_start = today.replace(day=1)
    days_in_month = monthrange(today.year, today.month)[1]
    month_end = month_start + timedelta(days=days_in_month)

    live_count = await db.scalar(
        select(func.count()).select_from(Property).where(
            Property.owner_id == host.id, Property.is_published == True, Property.approval_status == "approved"  # noqa: E712
        )
    )
    bookings = (
        await db.execute(
            _host_bookings_query(host).where(
                Booking.status.in_([BookingStatus.confirmed, BookingStatus.completed]),
                Booking.check_in < month_end,
                Booking.check_out > month_start,
            )
        )
    ).scalars().all()

    booked_nights = 0
    for b in bookings:
        booked_nights += (min(b.check_out, month_end) - max(b.check_in, month_start)).days
    capacity = max(live_count, 1) * days_in_month
    # Net to the host (what /host/payouts shows), not the guest-paid total with taxes and platform fees.
    month_ids = [b.id for b in bookings if b.payment_status == PaymentStatus.paid and month_start <= b.check_in < month_end]
    revenue = 0
    if month_ids:
        revenue = await db.scalar(select(func.coalesce(func.sum(Payout.host_amount), 0)).where(Payout.booking_id.in_(month_ids))) or 0
    upcoming = (
        await db.execute(
            _host_bookings_query(host)
            .where(Booking.status == BookingStatus.confirmed, Booking.check_in >= today)
            .order_by(Booking.check_in.asc())
            .limit(10)
        )
    ).scalars().all()
    return {
        "bookings_this_month": len([b for b in bookings if month_start <= b.check_in < month_end]),
        "revenue": revenue,
        "occupancy_percent": round(100 * booked_nights / capacity, 1),
        "upcoming": [BookingOut.model_validate(b) for b in upcoming],
    }


# -- Photo uploads (same storage pipeline as the admin panel) ----------------------

@router.post("/presigned-upload-urls")
async def host_presigned_upload_urls(payload: PresignedBatchRequest, host: User = Depends(get_host)):
    return await admin_router.get_presigned_upload_urls(payload=payload, admin=host)


@router.post("/upload-image")
async def host_upload_image(file: UploadFile = File(...), host: User = Depends(get_host)):
    return await admin_router.upload_image_file(file=file, admin=host)
