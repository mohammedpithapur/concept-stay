import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, utc_now
from app.dependencies import get_admin, get_current_user, get_host
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.guest_id import GUEST_ID_TYPES, GuestIdDocument, RefundDispute
from app.models.property import Property
from app.models.user import User, UserRole
from app.services import private_storage
from app.services.cancellation import cancel_and_refund
from app.services.doc_upload import read_validated_upload
from app.services.email import send_admin_dispute_email, send_dispute_decision_email
from app.services.push import send_push_to_admins
from app.services.refunds import RefundError
from app.services.upload import UploadStorageError

router = APIRouter(tags=["guest-ids"])


class GuestIdOut(BaseModel):
    status: str
    doc_type: str | None = None
    rejection_reason: str | None = None
    uploaded_at: datetime | None = None
    signed_url: str | None = None


class RejectIn(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("A reason is required")
        return v[:1000]


class DecideIn(BaseModel):
    decision: str
    note: str = ""

    @field_validator("decision")
    @classmethod
    def _decision(cls, v):
        if v not in ("refund", "dismiss"):
            raise ValueError("decision must be 'refund' or 'dismiss'")
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        return v.strip()[:1000]


class DisputeOut(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    booking_ref: str
    property_name: str
    guest_name: str
    guest_email: str
    host_name: str
    total: int
    reason: str
    status: str
    admin_note: str | None = None
    created_at: datetime
    decided_at: datetime | None = None
    guest_id_url: str | None = None


def _out(doc: GuestIdDocument | None, url: str | None = None) -> GuestIdOut:
    if not doc or doc.deleted_at:
        return GuestIdOut(status="missing")
    return GuestIdOut(
        status=doc.status, doc_type=doc.doc_type, rejection_reason=doc.rejection_reason,
        uploaded_at=doc.uploaded_at, signed_url=url,
    )


async def _booking_for_guest(db: AsyncSession, booking_id: uuid.UUID, user: User, lock: bool = False) -> Booking:
    booking = await db.get(Booking, booking_id, with_for_update=lock)
    if not booking or booking.is_admin_block or booking.is_shadow_block:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return booking


async def _booking_for_host(db: AsyncSession, booking_id: uuid.UUID, host: User, lock: bool = False) -> tuple[Booking, Property]:
    booking = await db.get(Booking, booking_id, with_for_update=lock)
    if not booking or booking.is_admin_block or booking.is_shadow_block:
        raise HTTPException(status_code=404, detail="Booking not found")
    prop = await db.get(Property, booking.property_id)
    if host.role != UserRole.admin and (not prop or prop.owner_id != host.id):
        raise HTTPException(status_code=403, detail="Access denied")
    return booking, prop


async def _doc(db: AsyncSession, booking_id: uuid.UUID, lock: bool = False) -> GuestIdDocument | None:
    query = select(GuestIdDocument).where(GuestIdDocument.booking_id == booking_id)
    if lock:
        query = query.with_for_update()
    return await db.scalar(query)


# ── Guest ────────────────────────────────────────────────────────────────────

@router.post("/bookings/{booking_id}/guest-id", response_model=GuestIdOut, status_code=201)
async def upload_guest_id(
    booking_id: uuid.UUID,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await _booking_for_guest(db, booking_id, user, lock=True)
    if doc_type not in GUEST_ID_TYPES:
        raise HTTPException(status_code=422, detail=f"doc_type must be one of: {', '.join(GUEST_ID_TYPES)}")
    if booking.payment_status != PaymentStatus.paid or booking.status not in (BookingStatus.confirmed, BookingStatus.completed):
        raise HTTPException(status_code=409, detail="An ID can be added once the booking is paid")
    if await db.scalar(select(RefundDispute.id).where(RefundDispute.booking_id == booking.id, RefundDispute.status == "open")):
        raise HTTPException(status_code=409, detail="This booking is being reviewed; the ID cannot be changed right now")
    content, mime = await read_validated_upload(file)
    existing = await _doc(db, booking.id, lock=True)
    if existing and existing.status == "approved" and not existing.deleted_at:
        raise HTTPException(status_code=409, detail="Your ID has already been approved")

    try:
        path = await private_storage.upload_private(f"guest-ids/{booking.id}", file.filename or "id", content, mime)
    except UploadStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    old_path = existing.storage_path if existing and not existing.deleted_at else None
    if existing:
        existing.doc_type, existing.storage_path, existing.mime = doc_type, path, mime
        existing.filename = (file.filename or "id")[:255]
        existing.status, existing.rejection_reason = "pending", None
        existing.uploaded_at, existing.reviewed_at, existing.deleted_at = utc_now(), None, None
        doc = existing
    else:
        doc = GuestIdDocument(
            booking_id=booking.id, guest_id=user.id, doc_type=doc_type, storage_path=path,
            filename=(file.filename or "id")[:255], mime=mime,
        )
        db.add(doc)
    booking.guest_id_status = "pending"
    await db.commit()
    if old_path:
        try:
            await private_storage.delete_private(old_path)
        except UploadStorageError:
            pass  # the new file is saved; the old one is orphaned but unreachable
    return _out(doc)


@router.get("/bookings/{booking_id}/guest-id", response_model=GuestIdOut)
async def get_my_guest_id(
    booking_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    booking = await _booking_for_guest(db, booking_id, user)
    return _out(await _doc(db, booking.id))


# ── Host ─────────────────────────────────────────────────────────────────────

@router.get("/host/bookings/{booking_id}/guest-id", response_model=GuestIdOut)
async def host_get_guest_id(
    booking_id: uuid.UUID, host: User = Depends(get_host), db: AsyncSession = Depends(get_db)
):
    booking, _ = await _booking_for_host(db, booking_id, host)
    doc = await _doc(db, booking.id)
    if not doc or doc.deleted_at:
        return _out(None)
    try:
        url = await private_storage.signed_url(doc.storage_path, 300)
    except UploadStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return _out(doc, url)


@router.post("/host/bookings/{booking_id}/guest-id/approve", response_model=GuestIdOut)
async def host_approve_guest_id(
    booking_id: uuid.UUID, host: User = Depends(get_host), db: AsyncSession = Depends(get_db)
):
    booking, _ = await _booking_for_host(db, booking_id, host, lock=True)
    doc = await _doc(db, booking.id, lock=True)
    if not doc or doc.deleted_at or doc.status != "pending":
        raise HTTPException(status_code=409, detail="There is no pending ID to approve")
    doc.status, doc.reviewed_at, doc.rejection_reason = "approved", utc_now(), None
    booking.guest_id_status = "approved"
    await db.commit()
    return _out(doc)


@router.post("/host/bookings/{booking_id}/guest-id/reject", response_model=GuestIdOut)
async def host_reject_guest_id(
    booking_id: uuid.UUID,
    data: RejectIn,
    background_tasks: BackgroundTasks,
    host: User = Depends(get_host),
    db: AsyncSession = Depends(get_db),
):
    """Report a guest or booking as not legitimate: marks the ID rejected and opens a dispute for the admin."""
    booking, prop = await _booking_for_host(db, booking_id, host, lock=True)
    doc = await _doc(db, booking.id, lock=True)
    if not doc or doc.deleted_at or doc.status == "approved":
        raise HTTPException(status_code=409, detail="There is no ID to reject")
    if await db.scalar(select(RefundDispute.id).where(RefundDispute.booking_id == booking.id, RefundDispute.status == "open")):
        raise HTTPException(status_code=409, detail="This booking has already been reported")
    doc.status, doc.reviewed_at, doc.rejection_reason = "rejected", utc_now(), data.reason
    booking.guest_id_status = "rejected"
    db.add(RefundDispute(booking_id=booking.id, opened_by=host.id, reason=data.reason))
    try:
        await db.commit()
    except IntegrityError:  # two reports raced; the unique open-dispute index kept it to one
        await db.rollback()
        raise HTTPException(status_code=409, detail="This booking has already been reported")

    background_tasks.add_task(
        send_admin_dispute_email,
        booking_ref=booking.booking_ref, property_name=prop.name if prop else "", host_name=host.full_name,
        guest_name=booking.guest_name, guest_email=booking.guest_email, reason=data.reason,
    )
    background_tasks.add_task(
        send_push_to_admins,
        title="Booking reported by host", body=f"Ref: {booking.booking_ref} · {data.reason[:80]}", url="/admin",
    )
    return _out(doc)


# ── Admin ────────────────────────────────────────────────────────────────────

async def _dispute_out(db: AsyncSession, dispute: RefundDispute, with_url: bool) -> DisputeOut:
    booking = await db.get(Booking, dispute.booking_id)
    prop = await db.get(Property, booking.property_id)
    host = await db.get(User, prop.owner_id) if prop else None
    url = None
    if with_url:
        doc = await _doc(db, booking.id)
        if doc and not doc.deleted_at:
            try:
                url = await private_storage.signed_url(doc.storage_path, 300)
            except UploadStorageError:
                url = None
    return DisputeOut(
        id=dispute.id, booking_id=booking.id, booking_ref=booking.booking_ref, property_name=prop.name if prop else "",
        guest_name=booking.guest_name, guest_email=booking.guest_email, host_name=host.full_name if host else "",
        total=booking.total, reason=dispute.reason, status=dispute.status, admin_note=dispute.admin_note,
        created_at=dispute.created_at, decided_at=dispute.decided_at, guest_id_url=url,
    )


@router.get("/admin/disputes", response_model=list[DisputeOut])
async def admin_list_disputes(
    status: str | None = Query(None, pattern="^(open|refunded|dismissed)$"),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(RefundDispute).order_by(RefundDispute.created_at.desc())
    if status:
        query = query.where(RefundDispute.status == status)
    disputes = (await db.execute(query)).scalars().all()
    return [await _dispute_out(db, d, with_url=d.status == "open") for d in disputes]


@router.post("/admin/disputes/{dispute_id}/decide", response_model=DisputeOut)
async def admin_decide_dispute(
    dispute_id: uuid.UUID,
    data: DecideIn,
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    dispute = await db.get(RefundDispute, dispute_id, with_for_update=True)
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if dispute.status != "open":
        raise HTTPException(status_code=409, detail=f"This dispute is already {dispute.status}")
    booking = await db.get(Booking, dispute.booking_id, with_for_update=True)
    prop = await db.get(Property, booking.property_id)

    refunded = data.decision == "refund"
    if refunded:
        try:
            # Always the full amount, whatever the 10-day window says: that is the point of an admin decision.
            await cancel_and_refund(db, booking, booking.total, reason="dispute_refund")
        except RefundError as exc:
            await db.rollback()
            raise HTTPException(status_code=502, detail=f"Refund failed, dispute left open: {exc}")
        dispute = await db.get(RefundDispute, dispute_id, with_for_update=True)  # cancel_and_refund committed
    dispute.status = "refunded" if refunded else "dismissed"
    dispute.admin_note = data.note or None
    dispute.decided_by, dispute.decided_at = admin.id, utc_now()
    await db.commit()

    background_tasks.add_task(
        send_dispute_decision_email,
        to_email=booking.guest_email, guest_name=booking.guest_name, booking_ref=booking.booking_ref,
        property_name=prop.name if prop else "", refunded=refunded, amount=str(booking.total),
    )
    return await _dispute_out(db, dispute, with_url=False)
