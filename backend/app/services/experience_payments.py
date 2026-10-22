"""Confirming, failing and refunding experience payments. Both /verify and the Razorpay webhook come through here."""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import IST, utc_now
from app.models.experience import (
    Experience, ExperienceBooking, ExperiencePayment, ExperiencePayout, ExperienceSlot,
)
from app.models.user import User
from app.schemas.experience_booking import ExperienceVoucherOut
from app.services.email import send_experience_voucher_email
from app.services.experience_booking import seats_left
from app.services.refunds import RefundError, issue_refund

logger = logging.getLogger("conceptstay.api")

REVEALED = ("confirmed", "completed")


class SlotFull(Exception):
    """The guest paid for seats that were taken by someone else first; the payment has been refunded."""


async def confirm_experience_payment(
    db: AsyncSession, payment: ExperiencePayment, razorpay_payment_id: str
) -> ExperienceBooking:
    """Idempotent. Takes the seats and creates the payout, or refunds in full and raises SlotFull when none are left.

    The signature is verified by the caller. Commits.
    """
    # Lock the payment row: a second caller (verify racing the webhook) waits here, then sees the first result.
    payment = await db.get(ExperiencePayment, payment.id, with_for_update=True, populate_existing=True)
    booking = await db.get(ExperienceBooking, payment.booking_id, populate_existing=True)
    if payment.status == "paid" or booking.status in ("confirmed", "completed", "refunded"):
        await db.commit()
        return booking
    if booking.status == "failed_full":
        await db.commit()
        raise SlotFull()

    slot = await db.get(ExperienceSlot, booking.slot_id, with_for_update=True, populate_existing=True)
    if seats_left(slot) >= booking.party_size and slot.starts_at > datetime.now(timezone.utc):
        slot.seats_booked += booking.party_size
        payment.status = "paid"
        payment.razorpay_payment_id = razorpay_payment_id
        payment.updated_at = utc_now()
        booking.status = "confirmed"
        exp = await db.get(Experience, booking.experience_id)
        await db.execute(
            pg_insert(ExperiencePayout)
            .values(
                booking_id=booking.id, operator_id=exp.operator_id, gross_amount=booking.total,
                commission=booking.commission, fees=booking.service_fee, taxes=booking.taxes,
                operator_amount=max(0, booking.value - booking.commission), status="owed",
            )
            .on_conflict_do_nothing(index_elements=["booking_id"])
        )
        await db.commit()
        await db.refresh(booking)
        return booking

    # Other guests took the last seats first (or the slot has started): give the money back, never confirm.
    payment.razorpay_payment_id = razorpay_payment_id
    payment.updated_at = utc_now()
    payment.status = "paid"
    try:
        await asyncio.to_thread(issue_refund, razorpay_payment_id, payment.amount)
        payment.status = "refunded"
    except RefundError:
        logger.warning("Auto-refund failed for experience payment %s; refund it from the admin panel", payment.id)
    booking.status = "failed_full"
    await db.commit()
    raise SlotFull()


async def apply_full_refund(db: AsyncSession, booking: ExperienceBooking, payment: ExperiencePayment) -> bool:
    """Mark a confirmed booking refunded: seats go back to the slot and an owed payout is voided. Idempotent.

    Returns True when the operator was already paid, so the admin must recover that money by hand. Does not commit.
    """
    if booking.status not in REVEALED:
        return False
    booking.status = "refunded"
    payment.status = "refunded"
    payment.updated_at = utc_now()
    slot = await db.get(ExperienceSlot, booking.slot_id, with_for_update=True, populate_existing=True)
    slot.seats_booked = max(0, slot.seats_booked - booking.party_size)
    payout = await db.scalar(select(ExperiencePayout).where(ExperiencePayout.booking_id == booking.id))
    if payout is None:
        return False
    if payout.status == "owed":
        payout.status = "voided"
        return False
    return payout.status == "paid"


async def queue_voucher_email(db: AsyncSession, booking: ExperienceBooking, background_tasks) -> None:
    exp = await db.get(Experience, booking.experience_id)
    slot = await db.get(ExperienceSlot, booking.slot_id)
    guest = await db.get(User, booking.guest_id)
    operator = await db.get(User, exp.operator_id)
    background_tasks.add_task(
        send_experience_voucher_email,
        to_email=guest.email, guest_name=guest.full_name, title=exp.title,
        starts_at=slot.starts_at.astimezone(IST).strftime("%a %d %b %Y, %I:%M %p IST"),
        party_size=booking.party_size, meeting_point=exp.meeting_point, voucher_code=booking.voucher_code,
        operator_name=operator.full_name, operator_phone=operator.phone or "", operator_email=operator.email,
    )


def voucher_out(booking: ExperienceBooking, exp: Experience, slot: ExperienceSlot, operator: User) -> ExperienceVoucherOut:
    revealed = booking.status in REVEALED
    return ExperienceVoucherOut(
        id=booking.id, experience_id=booking.experience_id, slot_id=booking.slot_id, experience_title=exp.title,
        starts_at=slot.starts_at, party_size=booking.party_size, price_per_person=booking.price_per_person,
        value=booking.value, service_fee=booking.service_fee, taxes=booking.taxes, total=booking.total,
        currency=booking.currency, charged_minor=booking.charged_minor, status=booking.status,
        created_at=booking.created_at,
        voucher_code=booking.voucher_code if revealed else None,
        meeting_point=exp.meeting_point if revealed else None,
        operator_name=operator.full_name if revealed else None,
        operator_phone=operator.phone if revealed else None,
        operator_email=operator.email if revealed else None,
    )


async def load_voucher(db: AsyncSession, booking: ExperienceBooking) -> ExperienceVoucherOut:
    exp = await db.get(Experience, booking.experience_id)
    slot = await db.get(ExperienceSlot, booking.slot_id)
    operator = await db.get(User, exp.operator_id)
    return voucher_out(booking, exp, slot, operator)


async def handle_experience_webhook_event(db: AsyncSession, event_type: str, payload: dict, background_tasks=None) -> bool:
    """Handle a Razorpay event if it belongs to an experience order. Returns True when it did."""
    if event_type in ("payment.captured", "payment.failed"):
        entity = payload.get("payment", {}).get("entity", {})
        order_id = entity.get("order_id")
        payment = None
        if order_id:
            payment = await db.scalar(select(ExperiencePayment).where(ExperiencePayment.razorpay_order_id == order_id))
        if payment is None:
            return False
        if event_type == "payment.captured":
            if entity.get("id"):
                booking = await db.get(ExperienceBooking, payment.booking_id)
                was_confirmed = booking.status in REVEALED
                try:
                    booking = await confirm_experience_payment(db, payment, entity["id"])
                    if background_tasks is not None and not was_confirmed and booking.status == "confirmed":
                        await queue_voucher_email(db, booking, background_tasks)
                except SlotFull:
                    pass
        elif payment.status == "created":
            booking = await db.get(ExperienceBooking, payment.booking_id)
            payment.status = "failed"
            payment.updated_at = utc_now()
            if booking.status == "pending":
                booking.status = "expired"
            await db.commit()
        return True

    if event_type == "refund.created":
        entity = payload.get("refund", {}).get("entity", {})
        pay_id = entity.get("payment_id")
        payment = None
        if pay_id:
            payment = await db.scalar(select(ExperiencePayment).where(ExperiencePayment.razorpay_payment_id == pay_id))
        if payment is None:
            return False
        booking = await db.get(ExperienceBooking, payment.booking_id)
        if (entity.get("amount") or payment.amount) >= payment.amount:  # only full refunds are supported
            await apply_full_refund(db, booking, payment)
            await db.commit()
        return True

    return False
