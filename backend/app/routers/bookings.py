import asyncio
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.database import get_db, utc_now
from app.dependencies import get_current_user, get_admin
from app.models.user import User
from app.rate_limit import limiter
from app.models.property import Property
from app.models.property_group import PropertyGroup, PropertyGroupMember
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.payment import Payment, RazorpayPaymentStatus
from app.models.payout import Payout
from app.models.price_override import PropertyPriceOverride
from app.schemas.booking import BookingCreate, BookingOut, BookingStatusUpdate, BookingListOut
from app.services.cancellation import compute_refund, rescale_payout
from app.services.property import public_listing_clauses
from app.services.refunds import RefundError, issue_refund
from app.services.booking import calculate_pricing, apply_group_blocking, remove_shadow_blocks, auto_cleanup_expired_bookings
from app.services.email import send_booking_cancellation_email
from app.services.push import send_push_to_user, send_push_to_admins


router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingOut)
@limiter.limit("10/minute")
async def create_booking(
    request: Request,
    data: BookingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auto_cleanup_expired_bookings(db)
    property = await db.scalar(
        select(Property).where(Property.id == data.property_id, *public_listing_clauses())
    )
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")

    # Acquire pessimistic lock to serialize concurrent bookings on the same property or group
    group_member = await db.scalar(
        select(PropertyGroupMember).where(PropertyGroupMember.property_id == data.property_id)
    )
    if group_member:
        # Lock the PropertyGroup row to serialize bookings on any room in this group
        await db.execute(
            select(PropertyGroup)
            .where(PropertyGroup.id == group_member.group_id)
            .with_for_update()
        )
    else:
        # Lock the individual Property row to serialize bookings on this property
        await db.execute(
            select(Property)
            .where(Property.id == data.property_id)
            .with_for_update()
        )

    # Fetch active price overrides that overlap the stay dates
    overrides_res = await db.execute(
        select(PropertyPriceOverride).where(
            PropertyPriceOverride.property_id == data.property_id,
            PropertyPriceOverride.start_date < data.check_out,
            PropertyPriceOverride.end_date > data.check_in,
        )
    )
    price_overrides = list(overrides_res.scalars().all())

    # 1. Check if the CURRENT GUEST already has a pending booking for these exact dates & property
    existing_pending = await db.scalar(
        select(Booking).where(
            Booking.property_id == data.property_id,
            Booking.guest_id == user.id,
            Booking.status == BookingStatus.pending,
            Booking.check_in == data.check_in,
            Booking.check_out == data.check_out,
        )
    )

    if existing_pending:
        # Reuse the existing pending booking for this guest, update pricing/info if needed
        pricing = calculate_pricing(property, data.check_in, data.check_out, data.pets, data.guests, price_overrides=price_overrides)
        existing_pending.guests = data.guests
        existing_pending.pets = data.pets
        existing_pending.nights = pricing["nights"]
        existing_pending.base_price = pricing["base_price"]
        existing_pending.cleaning_fee = pricing["cleaning_fee"]
        existing_pending.pet_charge = pricing["pet_charge"]
        existing_pending.extra_guest_charge = pricing["extra_guest_charge"]
        existing_pending.taxes = pricing["taxes"]
        existing_pending.service_fee = pricing["service_fee"]
        existing_pending.total = pricing["total"]
        # a Razorpay order cannot change amount: drop an unpaid one that no longer matches so a fresh order is made
        stale = await db.scalar(select(Payment).where(
            Payment.booking_id == existing_pending.id,
            Payment.status == RazorpayPaymentStatus.created,
            Payment.amount != pricing["total"] * 100,
        ))
        if stale:
            await db.delete(stale)
        existing_pending.guest_name = data.guest_name or user.full_name
        existing_pending.guest_email = data.guest_email or user.email
        existing_pending.guest_phone = data.guest_phone or user.phone
        if data.note is not None:
            existing_pending.note = data.note
        await db.commit()
        await db.refresh(existing_pending)
        return existing_pending

    # 2. Check availability — overlapping confirmed/pending bookings from OTHER users
    overlapping = await db.execute(
        select(Booking).where(
            Booking.property_id == data.property_id,
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.pending]),
            Booking.check_in < data.check_out,
            Booking.check_out > data.check_in,
            Booking.guest_id != user.id,
        )
    )
    if overlapping.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Property is not available for these dates")

    if data.pets > 0:
        if not property.pets_allowed:
            raise HTTPException(status_code=400, detail="Pets are not allowed at this property")
        if data.pets > property.max_pets:
            raise HTTPException(status_code=400, detail=f"Maximum allowed pets is {property.max_pets}")

    pricing = calculate_pricing(property, data.check_in, data.check_out, data.pets, data.guests, price_overrides=price_overrides)

    booking = Booking(
        property_id=data.property_id,
        guest_id=user.id,
        check_in=data.check_in,
        check_out=data.check_out,
        guests=data.guests,
        pets=data.pets,
        nights=pricing["nights"],
        base_price=pricing["base_price"],
        cleaning_fee=pricing["cleaning_fee"],
        pet_charge=pricing["pet_charge"],
        extra_guest_charge=pricing["extra_guest_charge"],
        taxes=pricing["taxes"],
        service_fee=pricing["service_fee"],
        total=pricing["total"],
        status=BookingStatus.pending,
        guest_name=data.guest_name or user.full_name,
        guest_email=data.guest_email or user.email,
        guest_phone=data.guest_phone or user.phone,
        note=data.note,
    )
    db.add(booking)
    await db.flush()  # Populates booking.id and database-side defaults without committing transaction
    await apply_group_blocking(db, booking, commit=False)
    await db.commit()
    await db.refresh(booking)
    return booking


@router.get("/mine", response_model=BookingListOut)
async def my_bookings(
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auto_cleanup_expired_bookings(db)
    base_query = select(Booking).where(
        Booking.guest_id == user.id,
        Booking.is_shadow_block == False,
        Booking.is_admin_block == False,  # Admin blocks must not appear in guest booking history
    )
    if status:
        base_query = base_query.where(Booking.status == status)

    total = await db.scalar(select(func.count()).select_from(base_query.subquery()))

    paged_query = (
        base_query.order_by(Booking.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(paged_query)
    items = result.scalars().all()
    return {"items": items, "total": total, "page": page, "limit": limit}


# ── Admin booking management — registered BEFORE /{booking_id} to avoid shadowing ──

@router.get("/admin/all", response_model=BookingListOut)
async def admin_list_bookings(
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 20,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    await auto_cleanup_expired_bookings(db)
    base_query = select(Booking).where(
        Booking.is_shadow_block == False,
        Booking.is_admin_block == False,  # Exclude admin blocks from bookings management tab
    )
    if search:
        base_query = base_query.where(
            or_(
                Booking.guest_name.ilike(f"%{search}%"),
                Booking.guest_email.ilike(f"%{search}%"),
                Booking.booking_ref.ilike(f"%{search}%"),
            )
        )
    if status:
        base_query = base_query.where(Booking.status == status)

    total = await db.scalar(select(func.count()).select_from(base_query.subquery()))

    paged_query = (
        base_query.order_by(Booking.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(paged_query)
    items = result.scalars().all()
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.patch("/admin/{booking_id}", response_model=BookingOut)
async def update_booking_status(
    booking_id: str,
    data: BookingStatusUpdate,
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    old_status = booking.status
    booking.status = BookingStatus(data.status)
    if booking.status == BookingStatus.cancelled:
        await remove_shadow_blocks(db, booking, commit=False)
    await db.commit()
    await db.refresh(booking)

    # Trigger cancellation notifications if status transitioned to cancelled
    if booking.status == BookingStatus.cancelled and old_status != BookingStatus.cancelled:
        property_obj = await db.get(Property, booking.property_id)
        property_name = property_obj.name if property_obj else "Concept Stay Property"
        is_refunded = (booking.payment_status.value == "refunded")

        background_tasks.add_task(
            send_booking_cancellation_email,
            to_email=booking.guest_email,
            guest_name=booking.guest_name,
            booking_ref=booking.booking_ref,
            property_name=property_name,
            refund=is_refunded,
            total=str(booking.total),
        )

    # Push notification to guest when booking status changes
    if booking.guest_id and booking.status != old_status:
        property_obj = await db.get(Property, booking.property_id)
        prop_name = property_obj.name if property_obj else "Concept Stay Property"
        background_tasks.add_task(
            send_push_to_user,
            user_id=booking.guest_id,
            title=f"Booking {booking.status.value.title()} — {prop_name}",
            body=f"Your booking (Ref: {booking.booking_ref}) status is now {booking.status.value}.",
            url="/dashboard",
        )

    return booking


# ── Guest cancellation ──────────────────────────────────────────────────────

async def _load_cancellable(db: AsyncSession, booking_id: str, user: User, lock: bool) -> Booking:
    try:
        booking_uuid = uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid booking ID format")
    booking = await db.get(Booking, booking_uuid, with_for_update=lock)
    if not booking or booking.is_admin_block or booking.is_shadow_block:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return booking


def _cancel_blocker(booking: Booking, today: date) -> str | None:
    if booking.status in (BookingStatus.cancelled, BookingStatus.completed):
        return f"Booking is already {booking.status.value}"
    if booking.check_in <= today:
        return "Bookings cannot be cancelled on or after the check-in date"
    return None


@router.get("/{booking_id}/refund-preview")
async def refund_preview(
    booking_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    booking = await _load_cancellable(db, booking_id, user, lock=False)
    prop = await db.get(Property, booking.property_id)
    policy = prop.cancellation_policy if prop else "non_refundable"
    paid = booking.payment_status == PaymentStatus.paid
    can_cancel = _cancel_blocker(booking, date.today()) is None
    refund = compute_refund(policy, booking.total, booking.check_in, date.today()) if (paid and can_cancel) else 0
    return {"can_cancel": can_cancel, "policy": policy, "refund_amount": refund, "total_paid": booking.total if paid else 0}


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_my_booking(
    booking_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await _load_cancellable(db, booking_id, user, lock=True)
    today = date.today()
    blocker = _cancel_blocker(booking, today)
    if blocker:
        raise HTTPException(status_code=409, detail=blocker)

    prop = await db.get(Property, booking.property_id)
    refund_amount = 0
    if booking.payment_status == PaymentStatus.paid:
        payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
        policy = prop.cancellation_policy if prop else "non_refundable"
        refund_amount = compute_refund(policy, booking.total, booking.check_in, today)
        if refund_amount > 0:
            try:
                await asyncio.to_thread(issue_refund, payment.razorpay_payment_id if payment else "", refund_amount)
            except RefundError as exc:
                raise HTTPException(status_code=502, detail=f"Refund failed, booking not cancelled: {exc}")
            booking.payment_status = PaymentStatus.refunded
            if payment and refund_amount >= booking.total:
                payment.status = RazorpayPaymentStatus.refunded
                payment.updated_at = utc_now()
        payout = await db.scalar(select(Payout).where(Payout.booking_id == booking.id).with_for_update())
        if payout:
            rescale_payout(payout, booking.total, refund_amount)

    booking.refund_amount = refund_amount
    booking.status = BookingStatus.cancelled
    await remove_shadow_blocks(db, booking, commit=False)
    await db.commit()
    await db.refresh(booking)

    prop_name = prop.name if prop else "Concept Stay Property"
    background_tasks.add_task(
        send_booking_cancellation_email,
        to_email=booking.guest_email,
        guest_name=booking.guest_name,
        booking_ref=booking.booking_ref,
        property_name=prop_name,
        refund=refund_amount > 0,
        total=str(refund_amount),
    )
    background_tasks.add_task(
        send_push_to_admins,
        title=f"Booking cancelled — {prop_name}",
        body=f"Ref: {booking.booking_ref} · {booking.guest_name} cancelled · refund ₹{refund_amount:,}",
        url="/admin",
    )
    return booking


# ── /{booking_id} — must come LAST to avoid shadowing admin routes ──

@router.get("/{booking_id}", response_model=BookingOut)
async def get_booking(
    booking_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auto_cleanup_expired_bookings(db)
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return booking
