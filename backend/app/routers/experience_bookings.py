"""Guest-side experience bookings: create (with the Razorpay order), verify the payment, list, read."""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.experience import Experience, ExperienceBooking, ExperiencePayment, ExperienceSlot
from app.models.user import User
from app.schemas.experience_booking import (
    ExperienceBookingIn, ExperienceCheckoutOut, ExperienceVerifyIn, ExperienceVoucherOut,
)
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
        raise HTTPException(status_code=403, detail="Access denied")
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
    except SlotFull:
        raise HTTPException(status_code=409, detail="Slot is full, your payment was refunded")
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
