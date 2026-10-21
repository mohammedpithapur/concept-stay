"""Guest ID files are kept only as long as they are useful: 30 days after check-out, unless a dispute is open."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import today_ist, utc_now
from app.models.booking import Booking
from app.models.guest_id import GuestIdDocument, RefundDispute
from app.services import private_storage

RETENTION_DAYS = 30


async def purge_expired_guest_ids(db: AsyncSession) -> int:
    """Delete stored ID files for stays that ended over RETENTION_DAYS ago. Returns how many were removed."""
    cutoff = today_ist() - timedelta(days=RETENTION_DAYS)
    open_dispute = select(RefundDispute.id).where(
        RefundDispute.booking_id == Booking.id, RefundDispute.status == "open"
    ).exists()
    rows = (
        await db.execute(
            select(GuestIdDocument)
            .join(Booking, Booking.id == GuestIdDocument.booking_id)
            .where(GuestIdDocument.deleted_at.is_(None), Booking.check_out <= cutoff, ~open_dispute)
        )
    ).scalars().all()
    for doc in rows:
        await private_storage.delete_private(doc.storage_path)
        doc.deleted_at = utc_now()
    await db.commit()
    return len(rows)
