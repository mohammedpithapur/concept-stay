"""
Payments router — Razorpay integration.

Endpoints:
  POST /payments/create-order   → creates Razorpay order + Payment record (user auth)
  POST /payments/verify         → verifies HMAC signature → confirms booking (user auth)
  POST /payments/webhook        → Razorpay event handler — source of truth (public, sig-verified)
  POST /payments/{id}/refund    → triggers Razorpay refund (admin only)
"""
import asyncio
import hashlib
import hmac
import json
import sys
import types
import uuid

# ── pkg_resources shim ────────────────────────────────────────────────────────
# razorpay SDK (v1.4.2) imports pkg_resources to read its own version.
# In Python 3.12 venvs with modern setuptools, pkg_resources may not be on
# sys.path even when setuptools is installed. Inject a minimal shim so the
# SDK can load without error.
try:
    import pkg_resources  # noqa: F401
except ImportError:
    _shim = types.ModuleType("pkg_resources")

    class _Dist:
        version = "0.0.0"

    _shim.get_distribution = lambda _name: _Dist()  # type: ignore[attr-defined]
    _shim.DistributionNotFound = Exception  # type: ignore[attr-defined]
    sys.modules["pkg_resources"] = _shim

import razorpay

from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, utc_now
from app.dependencies import get_admin, get_current_user
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.payment import Payment, RazorpayPaymentStatus
from app.models.user import User
from app.models.property import Property
from app.schemas.booking import BookingOut
from app.schemas.payment import PaymentOrderCreate, PaymentOrderOut, PaymentOut, PaymentVerifyIn
from app.services.email import send_booking_confirmation_email
from app.models.payout import Payout
from app.services.cancellation import rescale_payout
from app.services.refunds import RefundError, issue_refund
from app.services.payouts import create_payout_for_booking
from app.services.push import send_push_to_admins, send_push_to_user, send_push_to_all
from app.services.booking import remove_shadow_blocks
from app.services.fx import to_inr
from app.services.experience_payments import handle_experience_webhook_event


router = APIRouter(prefix="/payments", tags=["payments"])


def _get_razorpay_client() -> razorpay.Client:
    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


def _verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC-SHA256 verification as per Razorpay docs."""
    message = f"{order_id}|{payment_id}"
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── POST /payments/create-order ──────────────────────────────────────────────

@router.post("/create-order", response_model=PaymentOrderOut)
async def create_payment_order(
    data: PaymentOrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a Razorpay order for a pending booking.
    Idempotent: if a Payment record already exists for this booking,
    returns it instead of creating a duplicate order.
    """
    booking = await db.get(Booking, data.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if booking.status != BookingStatus.pending:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot pay for a booking with status '{booking.status.value}'",
        )
    if booking.payment_status != PaymentStatus.unpaid:
        raise HTTPException(
            status_code=409,
            detail=f"Booking payment status is already '{booking.payment_status.value}'",
        )

    # Idempotency: return existing order if already created
    existing = await db.scalar(
        select(Payment).where(Payment.booking_id == booking.id)
    )
    if existing and existing.status == RazorpayPaymentStatus.created:
        return PaymentOrderOut(
            payment_id=existing.id,
            razorpay_order_id=existing.razorpay_order_id,
            amount=existing.amount,
            currency=existing.currency,
            key_id=settings.RAZORPAY_KEY_ID,
        )

    amount_minor = booking.charged_minor or booking.total * 100  # in minor units of booking.currency

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Payment gateway not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env",
        )

    # Fetch property for notes
    prop_for_notes = await db.get(Property, booking.property_id)
    prop_name_for_notes = prop_for_notes.name if prop_for_notes else ""
    prop_city_for_notes = prop_for_notes.city if prop_for_notes else ""

    client = _get_razorpay_client()
    rz_order = client.order.create(
        {
            "amount": amount_minor,
            "currency": booking.currency,
            "receipt": booking.booking_ref,
            "payment_capture": 1,  # auto-capture
            # Notes appear in Razorpay dashboard under each payment
            "notes": {
                "booking_ref": booking.booking_ref,
                "property": prop_name_for_notes,
                "location": prop_city_for_notes,
                "check_in": str(booking.check_in),
                "check_out": str(booking.check_out),
                "nights": str(booking.nights),
                "guests": str(booking.guests),
                "guest_name": booking.guest_name,
                "guest_email": booking.guest_email,
                "guest_phone": booking.guest_phone or "",
            },
        }
    )

    payment = Payment(
        id=uuid.uuid4(),
        booking_id=booking.id,
        razorpay_order_id=rz_order["id"],
        amount=amount_minor,
        currency=booking.currency,
        status=RazorpayPaymentStatus.created,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return PaymentOrderOut(
        payment_id=payment.id,
        razorpay_order_id=payment.razorpay_order_id,
        amount=payment.amount,
        currency=payment.currency,
        key_id=settings.RAZORPAY_KEY_ID,
    )


# ── POST /payments/verify ────────────────────────────────────────────────────

@router.post("/verify", response_model=BookingOut)
async def verify_payment(
    data: PaymentVerifyIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by frontend after Razorpay checkout succeeds.
    Verifies HMAC-SHA256 signature, then atomically:
      - marks Payment as paid
      - sets Booking.status = confirmed, Booking.payment_status = paid
    Returns the updated booking.
    """
    payment = await db.scalar(
        select(Payment).where(Payment.razorpay_order_id == data.razorpay_order_id)
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    # Verify ownership
    booking = await db.get(Booking, payment.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Idempotency: already verified
    if payment.status == RazorpayPaymentStatus.paid:
        return booking

    # Verify HMAC-SHA256 signature
    if not _verify_signature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature,
    ):
        await remove_shadow_blocks(db, booking, commit=False)
        await db.delete(booking)
        await db.commit()
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    if booking.status != BookingStatus.pending:
        await _refund_late_payment(db, payment, booking, data.razorpay_payment_id)
        raise HTTPException(status_code=409, detail="Booking was cancelled before payment completed; payment refunded")

    # Atomic update: payment + booking in one transaction
    payment.status = RazorpayPaymentStatus.paid
    payment.razorpay_payment_id = data.razorpay_payment_id
    payment.razorpay_signature = data.razorpay_signature
    payment.updated_at = utc_now()

    booking.status = BookingStatus.confirmed
    booking.payment_status = PaymentStatus.paid
    await create_payout_for_booking(db, booking)

    await db.commit()
    await db.refresh(booking)

    # Trigger notifications in the background
    property_obj = await db.get(Property, booking.property_id)
    property_name = property_obj.name if property_obj else "Concept Stay Property"
    property_city = property_obj.city if property_obj else ""
    property_state = property_obj.state if property_obj else ""
    property_address = property_obj.address if property_obj else ""
    checkin_time = property_obj.check_in_time if property_obj else "2:00 PM"
    checkout_time = property_obj.check_out_time if property_obj else "11:00 AM"
    email_instructions = getattr(property_obj, 'booking_email_instructions', '') if property_obj else ""
    c_phone = property_obj.contact_phone if property_obj else ""
    c_email = property_obj.contact_email if property_obj else ""
    c_whatsapp = getattr(property_obj, 'contact_whatsapp', '') if property_obj else ""
    c_spare = getattr(property_obj, 'contact_spare_phone', '') if property_obj else ""
    h_rules = property_obj.house_rules if (property_obj and property_obj.house_rules) else []

    # Shared email kwargs to avoid repetition
    _email_kwargs = dict(
        guest_name=booking.guest_name,
        booking_ref=booking.booking_ref,
        property_name=property_name,
        property_city=property_city,
        property_state=property_state,
        property_address=property_address,
        checkin_time=checkin_time,
        checkout_time=checkout_time,
        check_in=str(booking.check_in),
        check_out=str(booking.check_out),
        guests=str(booking.guests),
        nights=str(booking.nights),
        total=str(booking.total),
        booking_email_instructions=email_instructions,
        contact_phone=c_phone,
        contact_email=c_email,
        contact_whatsapp=c_whatsapp,
        contact_spare_phone=c_spare,
        house_rules=h_rules,
    )

    # Send to guest
    background_tasks.add_task(send_booking_confirmation_email, to_email=booking.guest_email, **_email_kwargs)

    # Send same email to admin (staysearthy@gmail.com and property contact if different)
    admin_emails = {email for email in [c_email, "staysearthy@gmail.com"] if email and email != booking.guest_email}
    for recipient in admin_emails:
        background_tasks.add_task(send_booking_confirmation_email, to_email=recipient, **_email_kwargs)

    # Push notification to admin devices
    background_tasks.add_task(
        send_push_to_admins,
        title=f"New Booking — {property_name}",
        body=f"Ref: {booking.booking_ref} · {booking.guest_name} · {booking.check_in} → {booking.check_out} · ₹{booking.total:,}",
        url="/admin",
    )

    # Push notification to guest device
    if booking.guest_id:
        background_tasks.add_task(
            send_push_to_user,
            user_id=booking.guest_id,
            title="Booking Confirmed! 🎉",
            body=f"Your stay at {property_name} ({booking.check_in} → {booking.check_out}) is confirmed! Ref: {booking.booking_ref}",
            url="/dashboard",
        )

    return booking


# ── POST /payments/webhook ───────────────────────────────────────────────────

@router.post("/webhook", status_code=200)
async def razorpay_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Razorpay sends signed POST events here.
    This is the SOURCE OF TRUTH — more reliable than the frontend verify endpoint
    because the user might close the browser before verify is called.

    Always returns 200 — Razorpay will retry on any non-200 response.
    """
    body = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    webhook_secret = settings.RAZORPAY_KEY_SECRET  # use webhook secret if configured separately

    # Verify webhook signature
    expected = hmac.new(
        webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        # Return 200 anyway so Razorpay doesn't retry — but log the failure
        return {"status": "signature_mismatch"}

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        return {"status": "invalid_json"}

    event_type: str = event.get("event", "")
    payload = event.get("payload", {})

    # Experience orders share this webhook URL: hand them to the experience handler, stays carry on below.
    if await handle_experience_webhook_event(db, event_type, payload, background_tasks):
        return {"status": "ok"}

    # ── payment.captured ──────────────────────────────────────────────────────
    if event_type == "payment.captured":
        payment_entity = payload.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        payment_id = payment_entity.get("id")

        if order_id and payment_id:
            payment = await db.scalar(
                select(Payment).where(Payment.razorpay_order_id == order_id)
            )
            if payment and payment.status == RazorpayPaymentStatus.created:
                booking = await db.get(Booking, payment.booking_id)
                if booking and booking.status != BookingStatus.pending:
                    await _refund_late_payment(db, payment, booking, payment_id)
                    booking = None
                elif booking:
                    payment.status = RazorpayPaymentStatus.paid
                    payment.razorpay_payment_id = payment_id
                    payment.updated_at = utc_now()
                if booking:
                    booking.status = BookingStatus.confirmed
                    booking.payment_status = PaymentStatus.paid
                    await create_payout_for_booking(db, booking)
                    await db.commit()
                    await db.refresh(booking)

                    # Trigger notifications
                    property_obj = await db.get(Property, booking.property_id)
                    property_name = property_obj.name if property_obj else "Concept Stay Property"
                    property_city = property_obj.city if property_obj else ""
                    property_state = property_obj.state if property_obj else ""
                    property_address = property_obj.address if property_obj else ""
                    checkin_time = property_obj.check_in_time if property_obj else "2:00 PM"
                    checkout_time = property_obj.check_out_time if property_obj else "11:00 AM"
                    email_instructions = getattr(property_obj, 'booking_email_instructions', '') if property_obj else ""
                    c_phone = property_obj.contact_phone if property_obj else ""
                    c_email = property_obj.contact_email if property_obj else ""
                    c_whatsapp = getattr(property_obj, 'contact_whatsapp', '') if property_obj else ""
                    c_spare = getattr(property_obj, 'contact_spare_phone', '') if property_obj else ""
                    h_rules = property_obj.house_rules if (property_obj and property_obj.house_rules) else []

                    # Shared email kwargs
                    _email_kwargs = dict(
                        guest_name=booking.guest_name,
                        booking_ref=booking.booking_ref,
                        property_name=property_name,
                        property_city=property_city,
                        property_state=property_state,
                        property_address=property_address,
                        checkin_time=checkin_time,
                        checkout_time=checkout_time,
                        check_in=str(booking.check_in),
                        check_out=str(booking.check_out),
                        guests=str(booking.guests),
                        nights=str(booking.nights),
                        total=str(booking.total),
                        booking_email_instructions=email_instructions,
                        contact_phone=c_phone,
                        contact_email=c_email,
                        contact_whatsapp=c_whatsapp,
                        contact_spare_phone=c_spare,
                        house_rules=h_rules,
                    )

                    # Send to guest
                    background_tasks.add_task(send_booking_confirmation_email, to_email=booking.guest_email, **_email_kwargs)

                    # Send same email to admin (staysearthy@gmail.com and property contact if different)
                    admin_emails = {email for email in [c_email, "staysearthy@gmail.com"] if email and email != booking.guest_email}
                    for recipient in admin_emails:
                        background_tasks.add_task(send_booking_confirmation_email, to_email=recipient, **_email_kwargs)

                    # Push notification to admin devices
                    background_tasks.add_task(
                        send_push_to_admins,
                        title=f"New Booking — {property_name}",
                        body=f"Ref: {booking.booking_ref} · {booking.guest_name} · {booking.check_in} → {booking.check_out} · ₹{booking.total:,}",
                        url="/admin",
                    )

                    # Push notification to guest device
                    if booking.guest_id:
                        background_tasks.add_task(
                            send_push_to_user,
                            user_id=booking.guest_id,
                            title="Booking Confirmed! 🎉",
                            body=f"Your stay at {property_name} ({booking.check_in} → {booking.check_out}) is confirmed! Ref: {booking.booking_ref}",
                            url="/dashboard",
                        )

                else:
                    await db.commit()

    # ── payment.failed ────────────────────────────────────────────────────────
    elif event_type == "payment.failed":
        payment_entity = payload.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")

        if order_id:
            payment = await db.scalar(
                select(Payment).where(Payment.razorpay_order_id == order_id)
            )
            if payment and payment.status == RazorpayPaymentStatus.created:
                booking = await db.get(Booking, payment.booking_id)
                if booking:
                    await remove_shadow_blocks(db, booking, commit=False)
                    await db.delete(booking)
                await db.commit()

    # ── refund.created ────────────────────────────────────────────────────────
    elif event_type == "refund.created":
        payment_entity = payload.get("refund", {}).get("entity", {})
        payment_id = payment_entity.get("payment_id")

        if payment_id:
            payment = await db.scalar(
                select(Payment).where(Payment.razorpay_payment_id == payment_id)
            )
            if payment:
                booking = await db.get(Booking, payment.booking_id)
                gateway_minor = payment_entity.get("amount") or payment.amount
                refunded = 0
                if booking:  # convert back with the rate the booking was charged at, so INR and USD both stay exact
                    refunded = booking.total if gateway_minor >= payment.amount else to_inr(gateway_minor, booking.fx_rate)
                if booking and refunded > (booking.refund_amount or 0):
                    first_refund = not booking.refund_amount
                    booking.refund_amount = min(refunded, booking.total)
                    booking.payment_status = PaymentStatus.refunded
                    if booking.refund_amount >= booking.total:
                        payment.status = RazorpayPaymentStatus.refunded
                        payment.updated_at = utc_now()
                    if first_refund:
                        payout = await db.scalar(select(Payout).where(Payout.booking_id == booking.id))
                        if payout:
                            rescale_payout(payout, booking.total, booking.refund_amount)
                    await db.commit()

    return {"status": "ok"}


async def _refund_late_payment(db: AsyncSession, payment: Payment, booking: Booking, razorpay_payment_id: str) -> None:
    """Money arrived for a booking that is no longer pending (cancelled while checkout was open): never
    resurrect it, since its dates may be rebooked. Record the capture and return the money in full."""
    payment.razorpay_payment_id = razorpay_payment_id
    payment.updated_at = utc_now()
    payment.status = RazorpayPaymentStatus.paid
    try:
        await asyncio.to_thread(issue_refund, razorpay_payment_id, payment.amount)
        payment.status = RazorpayPaymentStatus.refunded
    except RefundError:
        pass  # stays 'paid' on a cancelled booking: visible to the admin, who can refund via /payments/{id}/refund
    await db.commit()


async def _void_payout(db: AsyncSession, booking: Booking) -> None:
    """A full refund outside the guest cancel flow (admin, gateway webhook) leaves the host nothing to be paid."""
    payout = await db.scalar(select(Payout).where(Payout.booking_id == booking.id))
    if payout:
        rescale_payout(payout, booking.total, booking.total)


# ── POST /payments/{payment_id}/refund ───────────────────────────────────────

@router.post("/{payment_id}/refund", response_model=PaymentOut)
async def refund_payment(
    payment_id: uuid.UUID,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: triggers a full refund via Razorpay API.
    Updates payment.status → refunded and booking.payment_status → refunded.
    """
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != RazorpayPaymentStatus.paid:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot refund payment with status '{payment.status.value}'",
        )
    if not payment.razorpay_payment_id:
        raise HTTPException(status_code=409, detail="No Razorpay payment ID recorded")

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")

    client = _get_razorpay_client()
    try:
        client.payment.refund(
            payment.razorpay_payment_id,
            {"amount": payment.amount, "speed": "normal"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Razorpay refund failed: {exc}",
        )

    payment.status = RazorpayPaymentStatus.refunded
    payment.updated_at = utc_now()

    booking = await db.get(Booking, payment.booking_id)
    if booking:
        booking.payment_status = PaymentStatus.refunded
        booking.refund_amount = booking.total
        await _void_payout(db, booking)

    await db.commit()
    await db.refresh(payment)
    return payment


# ── GET /payments/booking/{booking_id} ───────────────────────────────────────

@router.get("/booking/{booking_id}", response_model=PaymentOut)
async def get_payment_for_booking(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the payment record for a booking (owner or admin only)."""
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    payment = await db.scalar(
        select(Payment).where(Payment.booking_id == booking_id)
    )
    if not payment:
        raise HTTPException(status_code=404, detail="No payment record for this booking")
    return payment


# ── GET /payments/admin/all ──────────────────────────────────────────────────

@router.get("/admin/all")
async def list_admin_payments(
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: list all Razorpay transactions with guest, property, and booking details.
    """
    query = (
        select(Payment, Booking, Property)
        .join(Booking, Payment.booking_id == Booking.id)
        .join(Property, Booking.property_id == Property.id)
        .order_by(Payment.created_at.desc())
    )

    if status:
        query = query.where(Payment.status == status)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (Payment.razorpay_order_id.ilike(search_pattern)) |
            (Payment.razorpay_payment_id.ilike(search_pattern)) |
            (Booking.booking_ref.ilike(search_pattern)) |
            (Booking.guest_name.ilike(search_pattern)) |
            (Booking.guest_email.ilike(search_pattern))
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_count = await db.scalar(count_query) or 0

    offset = (page - 1) * limit
    results = await db.execute(query.offset(offset).limit(limit))
    rows = results.all()

    items = []
    for payment, booking, prop in rows:
        items.append({
            "id": str(payment.id),
            "booking_id": str(payment.booking_id),
            "booking_ref": booking.booking_ref,
            "guest_name": booking.guest_name,
            "guest_email": booking.guest_email,
            "property_name": prop.name,
            "razorpay_order_id": payment.razorpay_order_id,
            "razorpay_payment_id": payment.razorpay_payment_id,
            "amount_rupees": round(payment.amount / 100, 2),
            "currency": payment.currency,
            "status": payment.status.value if hasattr(payment.status, 'value') else str(payment.status),
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
        })

    return {
        "items": items,
        "total": total_count,
        "page": page,
        "limit": limit,
    }


# ── GET /payments/admin/settlements ─────────────────────────────────────────
# Fetches actual settlement batches from Razorpay API.
# Each settlement = one bank transfer (Razorpay pays you in batches every T+2 days).
# This is the ONLY accurate way to know what money has landed in your bank account.

@router.get("/admin/settlements")
async def list_admin_settlements(
    admin: User = Depends(get_admin),
):
    """
    Admin-only: fetch Razorpay settlement batches.
    Each settlement record = one actual bank transfer from Razorpay to your account.
    Returns settlement ID, date, amount settled, and UTR number for bank reconciliation.
    """
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        return {
            "settlements": [],
            "total_settled_rupees": 0,
            "error": "Razorpay not configured — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env",
        }

    try:
        client = _get_razorpay_client()
        # Fetch last 100 settlements (most recent first)
        rz_response = client.settlement.all({"count": 100})
        rz_items = rz_response.get("items", [])

        settlements = []
        total_settled_paise = 0

        for s in rz_items:
            amount_paise = s.get("amount", 0)
            total_settled_paise += amount_paise
            settled_at_ts = s.get("settled_at")
            settled_at_str = None
            if settled_at_ts:
                from datetime import datetime, timezone
                settled_at_str = datetime.fromtimestamp(settled_at_ts, tz=timezone.utc).isoformat()

            settlements.append({
                "settlement_id": s.get("id"),
                "status": s.get("status"),
                "amount_rupees": round(amount_paise / 100, 2),
                "fees_rupees": round(s.get("fees", 0) / 100, 2),
                "tax_rupees": round(s.get("tax", 0) / 100, 2),
                "utr": s.get("utr"),                    # Bank UTR — for reconciliation
                "settled_at": settled_at_str,
                "transaction_count": s.get("payment_count", 0),
            })

        return {
            "settlements": settlements,
            "total_settled_rupees": round(total_settled_paise / 100, 2),
            "count": len(settlements),
        }

    except Exception as exc:
        return {
            "settlements": [],
            "total_settled_rupees": 0,
            "error": f"Razorpay API error: {str(exc)}",
        }


# ── GET /payments/admin/summary ──────────────────────────────────────────────
# Returns a financial summary comparing: collected (in our DB) vs settled (from Razorpay).
# This is the key "Collected vs Bank" breakdown the admin needs.

@router.get("/admin/summary")
async def get_payments_summary(
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: compare total collected vs total settled to bank.
    - total_collected: sum of all paid payments in our DB (captured by Razorpay)
    - total_settled:   sum of all settlement batches from Razorpay API (in bank)
    - pending_with_razorpay: collected - settled (still being processed)
    """
    # Sum from our local DB — all payments we know are paid
    paid_result = await db.execute(
        select(
            func.count(Payment.id).label("count"),
            func.coalesce(func.sum(Payment.amount), 0).label("total_paise"),
        ).where(Payment.status == RazorpayPaymentStatus.paid)
    )
    paid_row = paid_result.one()
    total_collected_paise = int(paid_row.total_paise)
    paid_count = int(paid_row.count)

    # Refunded amounts
    refund_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == RazorpayPaymentStatus.refunded
        )
    )
    total_refunded_paise = int(refund_result.scalar() or 0)

    # Created (pending payment — not yet paid)
    pending_result = await db.execute(
        select(func.count(Payment.id)).where(Payment.status == RazorpayPaymentStatus.created)
    )
    pending_count = int(pending_result.scalar() or 0)

    # Now fetch settlements from Razorpay API
    total_settled_paise = 0
    settlement_count = 0
    razorpay_error = None

    if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
        try:
            client = _get_razorpay_client()
            rz_response = client.settlement.all({"count": 100})
            rz_items = rz_response.get("items", [])
            settlement_count = len(rz_items)
            total_settled_paise = sum(s.get("amount", 0) for s in rz_items)
        except Exception as exc:
            razorpay_error = str(exc)

    pending_with_razorpay_paise = max(0, total_collected_paise - total_settled_paise)

    return {
        "total_collected_rupees": round(total_collected_paise / 100, 2),
        "total_settled_rupees": round(total_settled_paise / 100, 2),
        "pending_with_razorpay_rupees": round(pending_with_razorpay_paise / 100, 2),
        "total_refunded_rupees": round(total_refunded_paise / 100, 2),
        "paid_transactions": paid_count,
        "pending_payment_count": pending_count,
        "settlement_batches": settlement_count,
        "razorpay_error": razorpay_error,
    }
