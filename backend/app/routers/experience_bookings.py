"""Guest-side experience bookings: create (with the Razorpay order), verify the payment, list, read."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.experience import Experience, ExperienceBooking, ExperiencePayment, ExperienceReview, ExperienceSlot
from app.models.user import User
from app.schemas.experience_booking import (
    ExperienceBookingIn, ExperienceCheckoutOut, ExperienceVerifyIn, ExperienceVoucherOut,
)
from app.schemas.experience_review import ExperienceReviewIn, ExperienceReviewOut
from app.services.experience_booking import create_experience_booking
from app.services.experience_payments import (
    SlotFull, confirm_experience_payment, load_voucher, queue_voucher_email, voucher_out,
)

router = APIRouter(prefix="/experience-bookings", tags=["experience-bookings"])


async def _own_booking(db: AsyncSession, booking_id: uuid.UUID, user: User) -> ExperienceBooking:
    booking = await db.get(ExperienceBooking, booking_id)
    if not booking or booking.guest_id != user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@router.post("", response_model=ExperienceCheckoutOut)
async def create_booking(
    data: ExperienceBookingIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    booking, payment = await create_experience_booking(db, user, data.slot_id, data.party_size, data.currency)
    return ExperienceCheckoutOut(
        booking=await load_voucher(db, booking), razorpay_order_id=payment.razorpay_order_id,
        amount=payment.amount, currency=payment.currency, key_id=settings.RAZORPAY_KEY_ID,
    )


@router.post("/{booking_id}/verify", response_model=ExperienceVoucherOut)
async def verify_booking_payment(
    booking_id: uuid.UUID,
    data: ExperienceVerifyIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.routers.payments import _verify_signature  # lazy: that router imports the payment services

    booking = await db.get(ExperienceBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    payment = await db.scalar(select(ExperiencePayment).where(ExperiencePayment.booking_id == booking.id))
    if not payment or payment.razorpay_order_id != data.razorpay_order_id:
        raise HTTPException(status_code=404, detail="Payment record not found")
    if payment.status == "paid" and booking.status in ("confirmed", "completed"):
        return await load_voucher(db, booking)
    if not _verify_signature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")
    was_confirmed = booking.status in ("confirmed", "completed")
    try:
        booking = await confirm_experience_payment(db, payment, data.razorpay_payment_id)
    except SlotFull as full:
        raise HTTPException(
            status_code=409,
            detail="Slot is full, your payment was refunded" if full.refunded
            else "Slot is full. We could not return your payment automatically; our team will refund you shortly.",
        )
    if not was_confirmed and booking.status == "confirmed":
        await queue_voucher_email(db, booking, background_tasks)
    return await load_voucher(db, booking)


@router.get("/mine", response_model=list[ExperienceVoucherOut])
async def my_bookings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(ExperienceBooking, Experience, ExperienceSlot, User)
            .join(Experience, Experience.id == ExperienceBooking.experience_id)
            .join(ExperienceSlot, ExperienceSlot.id == ExperienceBooking.slot_id)
            .join(User, User.id == Experience.operator_id)
            .where(ExperienceBooking.guest_id == user.id)
            .order_by(ExperienceBooking.created_at.desc())
        )
    ).all()
    return [voucher_out(b, e, s, o) for b, e, s, o in rows]


@router.get("/{booking_id}", response_model=ExperienceVoucherOut)
async def get_booking(
    booking_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await load_voucher(db, await _own_booking(db, booking_id, user))


@router.post("/{booking_id}/review", response_model=ExperienceReviewOut, status_code=201)
async def review_booking(
    booking_id: uuid.UUID,
    data: ExperienceReviewIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(ExperienceBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    slot = await db.get(ExperienceSlot, booking.slot_id)
    if booking.status not in ("confirmed", "completed") or slot.starts_at > datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="You can review an experience after you have taken part in it")
    exp = await db.get(Experience, booking.experience_id, with_for_update=True)  # serialises the rating recompute
    if await db.scalar(select(ExperienceReview.id).where(ExperienceReview.booking_id == booking.id)):
        raise HTTPException(status_code=409, detail="You already reviewed this booking")
    review = ExperienceReview(
        booking_id=booking.id, guest_id=user.id, experience_id=exp.id, rating=data.rating, text=data.text
    )
    db.add(review)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="You already reviewed this booking")
    avg, count = (
        await db.execute(
            select(func.avg(ExperienceReview.rating), func.count()).where(ExperienceReview.experience_id == exp.id)
        )
    ).one()
    exp.avg_rating = round(float(avg), 1)
    exp.review_count = count
    await db.commit()
    await db.refresh(review)
    return ExperienceReviewOut(
        rating=review.rating, text=review.text, guest_first_name=(user.full_name.split() or [""])[0],
        created_at=review.created_at,
    )
