"""Cancellation: one refund rule for every listing, and what a refund does to the host payout."""
import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import utc_now
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.payment import Payment, RazorpayPaymentStatus
from app.models.payout import Payout
from app.services.booking import remove_shadow_blocks
from app.services.refunds import issue_refund

REFUND_WINDOW_DAYS = 10


def refund_deadline(booked_at: datetime) -> datetime:
    """Last moment (same clock as `booked_at`) at which a cancellation is still refunded in full."""
    return booked_at + timedelta(days=REFUND_WINDOW_DAYS)


def compute_refund(total_paid: int, booked_at: datetime, now: datetime, check_in: date) -> int:
    """Full refund while inside the window and before check-in (India date); nothing otherwise.

    `booked_at` and `now` are naive UTC, like every datetime column in this app.
    """
    today_in_india = (now.replace(tzinfo=None) + timedelta(hours=5, minutes=30)).date()
    if check_in <= today_in_india or now > refund_deadline(booked_at):
        return 0
    return total_paid


def rescale_payout(payout: Payout, total_paid: int, refund_amount: int) -> None:
    """Shrink an owed payout to the share of the booking the platform kept. Voids it on a full refund."""
    if payout.status != "owed" or refund_amount <= 0:
        return
    retained = total_paid - refund_amount
    if retained <= 0:
        payout.status = "voided"
        payout.gross_amount = payout.commission = payout.fees = payout.taxes = payout.host_amount = 0
        return
    commission = (payout.commission * retained + total_paid // 2) // total_paid
    fees = (payout.fees * retained + total_paid // 2) // total_paid
    taxes = (payout.taxes * retained + total_paid // 2) // total_paid
    payout.gross_amount = retained
    payout.commission, payout.fees, payout.taxes = commission, fees, taxes
    payout.host_amount = max(0, retained - commission - fees - taxes)


async def cancel_and_refund(db: AsyncSession, booking: Booking, refund_amount: int, *, reason: str) -> Booking:
    """Cancel a booking and refund `refund_amount` rupees of it through the gateway. Commits.

    Shared by guest cancellation and admin dispute decisions. Safe to call twice: a booking that is already
    refunded is returned untouched, so the guest is never refunded twice. A gateway failure raises RefundError
    before anything is changed. Pass a locked booking (with_for_update) when concurrent calls are possible.
    """
    if booking.payment_status == PaymentStatus.refunded:
        return booking

    if booking.payment_status == PaymentStatus.paid:
        payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
        if refund_amount > 0:
            await asyncio.to_thread(issue_refund, payment.razorpay_payment_id if payment else "", refund_amount)
            booking.payment_status = PaymentStatus.refunded
            if payment and refund_amount >= booking.total:
                payment.status = RazorpayPaymentStatus.refunded
                payment.updated_at = utc_now()
        payout = await db.scalar(select(Payout).where(Payout.booking_id == booking.id).with_for_update())
        if payout:
            rescale_payout(payout, booking.total, refund_amount)
    else:
        refund_amount = 0

    booking.refund_amount = refund_amount
    if booking.status != BookingStatus.cancelled:
        booking.status = BookingStatus.cancelled
        await remove_shadow_blocks(db, booking, commit=False)
    await db.commit()
    await db.refresh(booking)
    return booking
