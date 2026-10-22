"""Operator payouts, the operator's booking list, and the admin refund for experience bookings."""
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, utc_now
from app.dependencies import get_admin, get_operator
from app.models.experience import (
    Experience, ExperienceBooking, ExperiencePayment, ExperiencePayout, ExperienceSlot,
)
from app.models.user import User
from app.routers.payouts import _kyc_by_host
from app.schemas.experience_payout import ExperiencePayoutOut, ExperienceRefundOut, OperatorBookingOut
from app.schemas.payout import PayoutMarkPaidIn
from app.services.experience_payments import REVEALED, apply_full_refund
from app.services.refunds import RefundError, issue_refund

router = APIRouter(tags=["experience-payouts"])


@router.get("/admin/experience-payouts", response_model=list[ExperiencePayoutOut])
async def admin_list_experience_payouts(
    status: str | None = Query(None, pattern="^(owed|paid|voided)$"),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(ExperiencePayout).order_by(ExperiencePayout.created_at.desc())
    if status:
        query = query.where(ExperiencePayout.status == status)
    payouts = (await db.execute(query)).scalars().all()
    kyc = await _kyc_by_host(db, {p.operator_id for p in payouts})
    return [
        ExperiencePayoutOut.model_validate(p).model_copy(update={"operator_kyc_status": kyc[p.operator_id]})
        for p in payouts
    ]


@router.post("/admin/experience-payouts/{payout_id}/mark-paid", response_model=ExperiencePayoutOut)
async def admin_mark_experience_payout_paid(
    payout_id: uuid.UUID,
    data: PayoutMarkPaidIn,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    payout = await db.get(ExperiencePayout, payout_id, with_for_update=True)
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout.status != "owed":
        raise HTTPException(status_code=409, detail=f"Payout is already '{payout.status}'")
    kyc = (await _kyc_by_host(db, {payout.operator_id}))[payout.operator_id]
    if kyc not in ("verified", "exempt"):
        raise HTTPException(status_code=409, detail="Operator KYC is not verified")
    payout.status = "paid"
    payout.paid_at = utc_now()
    payout.reference = data.reference
    await db.commit()
    await db.refresh(payout)
    return ExperiencePayoutOut.model_validate(payout).model_copy(update={"operator_kyc_status": kyc})


@router.get("/operator/payouts", response_model=list[ExperiencePayoutOut])
async def operator_list_payouts(operator: User = Depends(get_operator), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ExperiencePayout)
        .where(ExperiencePayout.operator_id == operator.id)
        .order_by(ExperiencePayout.created_at.desc())
    )
    return result.scalars().all()


@router.get("/operator/bookings", response_model=list[OperatorBookingOut])
async def operator_list_bookings(operator: User = Depends(get_operator), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(ExperienceBooking, Experience, ExperienceSlot, User)
            .join(Experience, Experience.id == ExperienceBooking.experience_id)
            .join(ExperienceSlot, ExperienceSlot.id == ExperienceBooking.slot_id)
            .join(User, User.id == ExperienceBooking.guest_id)
            .where(Experience.operator_id == operator.id, ExperienceBooking.status.in_(REVEALED))
            .order_by(ExperienceSlot.starts_at.desc())
        )
    ).all()
    return [
        OperatorBookingOut(
            id=b.id, experience_title=e.title, starts_at=s.starts_at, party_size=b.party_size,
            voucher_code=b.voucher_code, guest_first_name=(g.full_name.split() or [""])[0], guest_phone=g.phone,
            status=b.status,
        )
        for b, e, s, g in rows
    ]


@router.post("/admin/experience-bookings/{booking_id}/refund", response_model=ExperienceRefundOut)
async def admin_refund_experience_booking(
    booking_id: uuid.UUID, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)
):
    """Full refund of a paid booking: the money goes back, the seats return to the slot, an owed payout is voided."""
    booking = await db.get(ExperienceBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    payment = await db.scalar(
        select(ExperiencePayment).where(ExperiencePayment.booking_id == booking.id).with_for_update()
    )
    await db.refresh(booking)  # another request may have refunded it while we waited for the lock
    if booking.status == "refunded":
        await db.commit()
        return ExperienceRefundOut(booking_id=booking.id, status="refunded", payout_needs_recovery=False)
    if booking.status == "failed_full" and payment is not None:
        # The guest lost the last seat and the automatic refund failed: return the money, nothing else to undo.
        if payment.status == "refunded":
            await db.commit()
            return ExperienceRefundOut(booking_id=booking.id, status="failed_full", payout_needs_recovery=False)
        if payment.status == "paid" and payment.razorpay_payment_id:
            try:
                await asyncio.to_thread(issue_refund, payment.razorpay_payment_id, payment.amount)
            except RefundError as exc:
                raise HTTPException(status_code=502, detail=f"Refund failed: {exc}")
            payment.status = "refunded"
            payment.updated_at = utc_now()
            await db.commit()
            return ExperienceRefundOut(booking_id=booking.id, status="failed_full", payout_needs_recovery=False)
    if booking.status not in REVEALED or payment is None or not payment.razorpay_payment_id:
        raise HTTPException(status_code=409, detail="Only a paid booking can be refunded")
    try:
        await asyncio.to_thread(issue_refund, payment.razorpay_payment_id, payment.amount)
    except RefundError as exc:
        raise HTTPException(status_code=502, detail=f"Refund failed: {exc}")
    needs_recovery = await apply_full_refund(db, booking, payment)
    await db.commit()
    return ExperienceRefundOut(booking_id=booking.id, status="refunded", payout_needs_recovery=needs_recovery)
