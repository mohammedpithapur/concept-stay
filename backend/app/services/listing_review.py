"""Host edit -> admin approval -> published workflow."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import utc_now
from app.models.property import Property
from app.schemas.property import PropertyImageCreate
from app.services.property_images import sync_property_images

# Fields a host may never change directly (admin-controlled).
HOST_FORBIDDEN_FIELDS = {"is_published", "is_featured"}


def _clean_amenities(values: list) -> list[str]:
    return [a for a in values if isinstance(a, str) and not a.startswith("__space__:") and not a.startswith("{")]


async def apply_pending_changes(db: AsyncSession, prop: Property) -> Property:
    """Write prop.pending_changes onto the live row and clear them. Caller commits."""
    changes = dict(prop.pending_changes or {})
    images = changes.pop("images", None)
    spaces = changes.pop("spaces_detail", None)
    if "amenities" in changes and isinstance(changes["amenities"], list):
        changes["amenities"] = _clean_amenities(changes["amenities"])
    for key, value in changes.items():
        setattr(prop, key, value)
    if spaces is not None:
        prop.spaces_detail = spaces
    if images is not None:
        await sync_property_images(db, prop.id, [PropertyImageCreate(**img) for img in images])
    prop.pending_changes = None
    return prop


async def approve_listing(db: AsyncSession, prop: Property) -> Property:
    await apply_pending_changes(db, prop)
    if prop.approval_status != "approved":
        prop.is_published = True  # first approval publishes; an approved edit never re-publishes a hidden listing
    prop.approval_status = "approved"
    prop.rejection_reason = None
    return prop


def reject_listing(prop: Property, reason: str) -> Property:
    """Rejecting an edit to a live listing keeps it live; rejecting a new listing keeps it hidden."""
    prop.pending_changes = None
    prop.rejection_reason = reason
    prop.approval_status = "approved" if prop.approval_status == "approved" else "rejected"
    return prop


def set_verification(prop: Property, status: str) -> Property:
    prop.verification_status = status
    prop.verified_at = utc_now() if status == "verified" else None
    return prop
