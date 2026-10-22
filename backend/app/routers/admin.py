import asyncio
import logging
import uuid
from datetime import date, timedelta
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_admin
from app.models.user import HostStatus, OperatorStatus, User, UserRole
from app.models.property import Property
from app.models.property_group import PropertyGroup, PropertyGroupMember
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.payment import Payment
from app.models.review import Review
from app.models.ical import ICalLink
from app.models.price_override import PropertyPriceOverride
from app.schemas.booking import AdminBlockCreate, CalendarEventOut, CalendarOut
from app.schemas.price_override import PriceOverrideCreate, PriceOverrideOut
from app.schemas.property import PropertyCreate, PropertyUpdate, PropertyOut, PropertyImageCreate, PropertyImageUpdate, PropertyImageOut
from app.schemas.property_group import PropertyGroupCreate, PropertyGroupMemberCreate, PropertyGroupMemberUpdate, PropertyGroupOut
from app.services.booking import apply_group_blocking, remove_shadow_blocks
from app.models.property import PropertyImage
from app.services.upload import (
    delete_property_image_from_url,
    upload_property_image_from_bytes,
    upload_property_image_from_data_url,
    async_generate_batch_presigned_upload_urls,
    UploadStorageError,
    UploadValidationError,
)
from app.schemas.property import HostPropertyOut, RejectListingIn, VerificationUpdateIn
from app.schemas.user import HostStatusUpdate, OperatorStatusUpdate, UserOut
from app.services import listing_review
from app.services.cache import cache_delete, cache_get_json, cache_set_json, invalidate_properties_cache

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


async def fetch_group(db: AsyncSession, group_id: str) -> PropertyGroup | None:
    result = await db.execute(
        select(PropertyGroup)
        .options(selectinload(PropertyGroup.members).selectinload(PropertyGroupMember.property))
        .where(PropertyGroup.id == group_id)
    )
    return result.scalar_one_or_none()


from app.services.property_images import normalize_property_images, sync_property_images  # noqa: F401


# ── Dashboard ──

@router.get("/dashboard")
async def dashboard(admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    cache_key = "admin:dashboard"
    cached = await cache_get_json(cache_key)
    if cached:
        return cached

    confirmed = await db.scalar(
        select(func.count(Booking.id)).where(
            Booking.status == BookingStatus.confirmed,
            Booking.is_admin_block == False,
            Booking.is_shadow_block == False,
        )
    ) or 0
    completed = await db.scalar(
        select(func.count(Booking.id)).where(
            Booking.status == BookingStatus.completed,
            Booking.is_admin_block == False,
            Booking.is_shadow_block == False,
        )
    ) or 0
    pending = await db.scalar(
        select(func.count(Booking.id)).where(
            Booking.status == BookingStatus.pending,
            Booking.is_admin_block == False,
            Booking.is_shadow_block == False,
        )
    ) or 0
    total_bookings = confirmed + completed + pending
    total_properties = await db.scalar(select(func.count(Property.id))) or 0
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Booking.total), 0)).where(
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.completed]),
            Booking.is_admin_block == False,
            Booking.is_shadow_block == False,
        )
    ) or 0

    today = date.today()
    monthly_stats = []
    
    result = await db.execute(
        select(Booking.created_at, Booking.total)
        .where(
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.completed]),
            Booking.is_admin_block == False,
            Booking.is_shadow_block == False,
        )
    )
    bookings_data = result.all()

    for i in range(5, -1, -1):
        target_month_year = today.year
        target_month = today.month - i
        while target_month <= 0:
            target_month += 12
            target_month_year -= 1

        month_label = date(target_month_year, target_month, 1).strftime("%b %Y")
        
        m_rev = sum(
            b.total for b in bookings_data 
            if b.created_at and b.created_at.year == target_month_year and b.created_at.month == target_month
        )
        monthly_stats.append({"month": month_label, "revenue": m_rev})

    stats_dict = {
        "total_bookings": total_bookings,
        "confirmed_bookings": confirmed,
        "completed_bookings": completed,
        "pending_bookings": pending,
        "total_properties": total_properties,
        "total_revenue": revenue,
    }

    res_data = {
        **stats_dict,
        "stats": stats_dict,
        "monthly_revenue": monthly_stats,
    }
    await cache_set_json(cache_key, res_data, ttl_seconds=300)
    return res_data


@router.get("/analytics")
async def get_admin_analytics(admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    cache_key = "admin:analytics"
    cached = await cache_get_json(cache_key)
    if cached:
        return cached

    today = date.today()

    result = await db.execute(
        select(Booking, Property)
        .join(Property, Booking.property_id == Property.id)
        .where(
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.completed]),
            Booking.is_admin_block == False,  # Exclude iCal/admin block dates
            Booking.is_shadow_block == False,  # Exclude shadow blocks
        )
    )
    rows = result.all()

    # Daily Stats (Last 30 Days)
    daily_stats = []
    for i in range(29, -1, -1):
        day_date = today - timedelta(days=i)
        day_str = day_date.strftime("%d %b")
        
        day_rev = sum(
            b.total for b, p in rows 
            if b.created_at and b.created_at.date() == day_date
        )
        day_count = sum(
            1 for b, p in rows 
            if b.created_at and b.created_at.date() == day_date
        )
        day_nights = sum(
            b.nights for b, p in rows 
            if b.created_at and b.created_at.date() == day_date
        )

        daily_stats.append({
            "date": day_str,
            "full_date": day_date.isoformat(),
            "revenue": day_rev,
            "bookings": day_count,
            "nights": day_nights,
        })

    # Monthly Stats (Last 12 Months)
    monthly_stats = []
    for i in range(11, -1, -1):
        target_year = today.year
        target_month = today.month - i
        while target_month <= 0:
            target_month += 12
            target_year -= 1

        month_label = date(target_year, target_month, 1).strftime("%b %Y")
        
        m_rev = sum(
            b.total for b, p in rows 
            if b.created_at and b.created_at.year == target_year and b.created_at.month == target_month
        )
        m_count = sum(
            1 for b, p in rows 
            if b.created_at and b.created_at.year == target_year and b.created_at.month == target_month
        )
        m_nights = sum(
            b.nights for b, p in rows 
            if b.created_at and b.created_at.year == target_year and b.created_at.month == target_month
        )

        monthly_stats.append({
            "month": month_label,
            "revenue": m_rev,
            "bookings": m_count,
            "nights": m_nights,
        })

    # Property Performance Breakdown
    property_map = {}
    all_props_res = await db.execute(select(Property).options(selectinload(Property.images)))
    all_properties = all_props_res.scalars().all()
    for prop in all_properties:
        first_img = next((img.image_url for img in prop.images if img.is_primary), prop.images[0].image_url if prop.images else None)
        property_map[str(prop.id)] = {
            "property_id": str(prop.id),
            "name": prop.name,
            "city": prop.city,
            "state": prop.state,
            "price_per_night": prop.price_per_night,
            "total_revenue": 0,
            "bookings_count": 0,
            "nights_booked": 0,
            "image_url": first_img,
        }

    for b, p in rows:
        pid = str(b.property_id)
        if pid in property_map:
            property_map[pid]["total_revenue"] += b.total
            property_map[pid]["bookings_count"] += 1
            property_map[pid]["nights_booked"] += b.nights

    property_performance = list(property_map.values())
    property_performance.sort(key=lambda x: x["total_revenue"], reverse=True)

    total_rev = sum(b.total for b, p in rows)
    total_nights = sum(b.nights for b, p in rows)
    total_bks = len(rows)
    avg_daily_rate = round(total_rev / total_nights) if total_nights > 0 else 0

    analytics_response = {
        "summary": {
            "total_revenue": total_rev,
            "total_bookings": total_bks,
            "total_nights": total_nights,
            "avg_daily_rate": avg_daily_rate,
        },
        "daily_stats": daily_stats,
        "monthly_stats": monthly_stats,
        "property_performance": property_performance,
    }
    await cache_set_json(cache_key, analytics_response, ttl_seconds=30)
    return analytics_response



# ── Properties CRUD ──

@router.get("/properties", response_model=list[PropertyOut])
async def list_properties(
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .order_by(Property.created_at.desc())
    )
    return result.scalars().all()


@router.post("/properties", response_model=PropertyOut)
async def create_property(
    data: PropertyCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    images = await normalize_property_images(data.images)
    spaces = data.spaces_detail
    property_data = data.model_dump(exclude={"images", "spaces_detail"})
    if "amenities" in property_data and isinstance(property_data["amenities"], list):
        property_data["amenities"] = [a for a in property_data["amenities"] if isinstance(a, str) and not a.startswith("__space__:") and not a.startswith("{")]
    property = Property(owner_id=admin.id, **property_data)
    if spaces:
        property.spaces_detail = spaces
    db.add(property)

    try:
        await db.flush()
        await sync_property_images(db, property.id, images)
        await db.commit()
        await invalidate_properties_cache()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save property: {exc}") from exc

    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.id == property.id)
    )
    return result.scalar_one()


@router.patch("/properties/{property_id}", response_model=PropertyOut)
async def update_property(
    property_id: str,
    data: PropertyUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.id == prop_uuid)
    )
    property = result.scalar_one_or_none()
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")
    images = await normalize_property_images(data.images)
    update_data = data.model_dump(exclude_unset=True, exclude={"images"})
    spaces = update_data.pop("spaces_detail", None)
    if "amenities" in update_data and isinstance(update_data["amenities"], list):
        update_data["amenities"] = [a for a in update_data["amenities"] if isinstance(a, str) and not a.startswith("__space__:") and not a.startswith("{")]

    try:
        for key, val in update_data.items():
            setattr(property, key, val)

        if spaces is not None:
            property.spaces_detail = spaces

        await sync_property_images(db, property.id, images)
        await db.commit()
        await invalidate_properties_cache()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(f"Failed to update property {property_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update property: {exc}") from exc

    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.id == prop_uuid)
    )
    return result.scalar_one()


@router.delete("/properties/{property_id}")
async def delete_property(
    property_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    property = await db.get(Property, prop_uuid)
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")

    try:
        # 1. Delete reviews for this property
        await db.execute(delete(Review).where(Review.property_id == prop_uuid))

        # 2. Delete price overrides
        await db.execute(delete(PropertyPriceOverride).where(PropertyPriceOverride.property_id == prop_uuid))

        # 3. Delete property group memberships
        await db.execute(delete(PropertyGroupMember).where(PropertyGroupMember.property_id == prop_uuid))

        # 3b. Delete iCal links for this property
        await db.execute(delete(ICalLink).where(ICalLink.property_id == prop_uuid))

        # 4. Delete payments associated with bookings of this property
        booking_ids_subq = select(Booking.id).where(Booking.property_id == prop_uuid)
        await db.execute(delete(Payment).where(Payment.booking_id.in_(booking_ids_subq)))

        # 5. Delete bookings / blocks
        await db.execute(delete(Booking).where(Booking.property_id == prop_uuid))

        # 6. Delete property images
        await db.execute(delete(PropertyImage).where(PropertyImage.property_id == prop_uuid))

        # 7. Delete the property itself
        await db.delete(property)
        await db.commit()
        await invalidate_properties_cache()
        return {"message": "Property deleted"}
    except Exception as exc:
        await db.rollback()
        logger.error(f"Failed to delete property {property_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete property: {exc}") from exc


@router.post("/properties/{property_id}/duplicate", response_model=PropertyOut)
async def duplicate_property(
    property_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Clone a property as a new unpublished draft with all images duplicated."""
    try:
        source_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.id == source_uuid)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Property not found")

    new_property = Property(
        owner_id=source.owner_id,
        name=f"Copy of {source.name}",
        description=source.description,
        address=source.address,
        city=source.city,
        state=source.state,
        country=source.country,
        latitude=source.latitude,
        longitude=source.longitude,
        contact_phone=source.contact_phone,
        contact_email=source.contact_email,
        contact_whatsapp=source.contact_whatsapp,
        contact_spare_phone=source.contact_spare_phone,
        booking_email_instructions=source.booking_email_instructions,
        check_in_time=source.check_in_time,
        check_out_time=source.check_out_time,
        house_rules=list(source.house_rules) if source.house_rules else [],
        price_per_night=source.price_per_night,
        cleaning_fee=source.cleaning_fee,
        extra_guest_charge_per_night=source.extra_guest_charge_per_night,
        base_guests=source.base_guests,
        max_guests=source.max_guests,
        bedrooms=source.bedrooms,
        bathrooms=source.bathrooms,
        bathrooms_detail=list(source.bathrooms_detail) if source.bathrooms_detail else [],
        min_nights=source.min_nights,
        pets_allowed=source.pets_allowed,
        pet_charge_per_night=source.pet_charge_per_night,
        max_pets=source.max_pets,
        amenities=list(source.amenities) if source.amenities else [],
        is_published=False,
        override_house_rules=source.override_house_rules,
        override_amenities=source.override_amenities,
        override_details=source.override_details,
        property_type=source.property_type,
        categories=list(source.categories or []),
        experience_tags=list(source.experience_tags or []),
        number_of_rooms=source.number_of_rooms,
        about_stay=source.about_stay,
        the_space=source.the_space,
        location_notes=source.location_notes,
        what_guests_love=source.what_guests_love,
        things_to_know=source.things_to_know,
        cancellation_policy=source.cancellation_policy,
        approval_status="approved",
        avg_rating=0.0,
        review_count=0,
    )
    if source.spaces_detail:
        new_property.spaces_detail = [dict(s) for s in source.spaces_detail]
    db.add(new_property)
    await db.flush()

    # Copy all images from source property including album_name
    copied_count = 0
    cloned_images = []
    for img in (source.images or []):
        if img.image_url and not img.image_url.startswith("blob:"):
            new_img = PropertyImage(
                property_id=new_property.id,
                image_url=img.image_url,
                is_primary=img.is_primary,
                display_order=img.display_order,
                album_name=getattr(img, "album_name", "General") or "General",
            )
            cloned_images.append(new_img)
            copied_count += 1

    if copied_count == 0:
        # Fallback cover photo if source had no valid photos
        fallback_img = PropertyImage(
            property_id=new_property.id,
            image_url="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800",
            is_primary=True,
            display_order=1,
            album_name="General",
        )
        cloned_images.append(fallback_img)

    db.add_all(cloned_images)
    await db.commit()

    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.id == new_property.id)
    )
    return result.scalar_one()



# ── Property Images ──

class PresignedUrlRequestItem(BaseModel):
    id: Optional[str] = None
    mime_type: str = "image/webp"


class PresignedBatchRequest(BaseModel):
    items: list[PresignedUrlRequestItem]
    folder: str = "properties"


@router.post("/presigned-upload-urls")
async def get_presigned_upload_urls(
    payload: PresignedBatchRequest,
    admin: User = Depends(get_admin),
):
    """Generate Supabase Storage signed upload URLs for high-speed direct S3 client uploads."""
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items provided")
    if len(payload.items) > 500:
        raise HTTPException(status_code=400, detail="Batch size limit is 500 images")

    try:
        items_dict = [item.model_dump() for item in payload.items]
        urls = await async_generate_batch_presigned_upload_urls(items_dict, folder=payload.folder)
        return {"items": urls}
    except UploadStorageError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URLs: {exc}") from exc


@router.post("/upload-image")
async def upload_image_file(
    file: UploadFile = File(...),
    admin: User = Depends(get_admin),
):
    """Upload an image file to Supabase Storage and return the public URL."""
    if not file.content_type or file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Unsupported image type. Please upload JPG, PNG, or WEBP.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")

    # Use asyncio.to_thread to avoid blocking the event loop during Supabase HTTP upload

    try:
        public_url = await asyncio.to_thread(upload_property_image_from_bytes, image_bytes, file.content_type)
        return {"url": public_url}
    except UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UploadStorageError as exc:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {exc}") from exc


@router.post("/properties/{property_id}/images", response_model=PropertyImageOut)
async def add_image(
    property_id: str,
    data: PropertyImageCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    property = await db.get(Property, prop_uuid)
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")

    image_url = data.image_url
    if image_url.startswith("blob:"):
        raise HTTPException(status_code=400, detail="Cannot save temporary blob URL. Please upload the image first.")
    if image_url.startswith("data:image"):
        try:
            image_url = await asyncio.to_thread(upload_property_image_from_data_url, image_url)
        except UploadValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except UploadStorageError as exc:
            raise HTTPException(status_code=500, detail=f"Image upload failed: {exc}") from exc

    image = PropertyImage(
        property_id=prop_uuid,
        image_url=image_url,
        is_primary=data.is_primary,
        display_order=data.display_order,
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return image


@router.patch("/images/{image_id}", response_model=PropertyImageOut)
async def update_image(
    image_id: str,
    data: PropertyImageUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        img_uuid = uuid.UUID(image_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid image ID format")

    image = await db.get(PropertyImage, img_uuid)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(image, key, val)
    await db.commit()
    await db.refresh(image)
    return image


@router.delete("/images/{image_id}")
async def delete_image(
    image_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        img_uuid = uuid.UUID(image_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid image ID format")

    image = await db.get(PropertyImage, img_uuid)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete physical file from Supabase Storage bucket
    try:
        delete_property_image_from_url(image.image_url)
    except UploadStorageError:
        pass  # If file was already deleted from bucket, continue deleting DB record

    # Delete database record from PostgreSQL
    await db.delete(image)
    await db.commit()
    return {"message": "Image deleted successfully"}


# ── Property Groups ──

@router.get("/groups", response_model=list[PropertyGroupOut])
async def list_groups(
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PropertyGroup)
        .options(selectinload(PropertyGroup.members).selectinload(PropertyGroupMember.property))
        .order_by(PropertyGroup.created_at.desc())
    )
    return result.scalars().all()


@router.post("/groups", response_model=PropertyGroupOut)
async def create_group(
    data: PropertyGroupCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    group = PropertyGroup(name=data.name)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return await fetch_group(db, str(group.id))


@router.post("/groups/{group_id}/members", response_model=PropertyGroupOut)
async def add_group_member(
    group_id: str,
    data: PropertyGroupMemberCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid group ID format")

    group = await db.get(PropertyGroup, group_uuid)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    try:
        prop_uuid = uuid.UUID(str(data.property_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    property = await db.get(Property, prop_uuid)
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")

    existing = await db.execute(
        select(PropertyGroupMember)
        .where(PropertyGroupMember.group_id == group_id, PropertyGroupMember.property_id == data.property_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Property already in this group")

    if data.is_whole_property:
        whole = await db.execute(
            select(PropertyGroupMember)
            .where(PropertyGroupMember.group_id == group_id, PropertyGroupMember.is_whole_property == True)
        )
        if whole.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Group already has a whole-property listing")

    member = PropertyGroupMember(
        group_id=group_uuid,
        property_id=prop_uuid,
        is_whole_property=data.is_whole_property,
    )
    db.add(member)
    await db.commit()
    return await fetch_group(db, str(group_uuid))


@router.delete("/groups/{group_id}/members/{member_id}", response_model=PropertyGroupOut)
async def remove_group_member(
    group_id: str,
    member_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member ID format")
    member = await db.get(PropertyGroupMember, member_uuid)
    if not member or str(member.group_id) != group_id:
        raise HTTPException(status_code=404, detail="Group member not found")

    await db.delete(member)
    await db.commit()
    return await fetch_group(db, group_id)


@router.patch("/groups/{group_id}/members/{member_id}", response_model=PropertyGroupOut)
async def update_group_member(
    group_id: str,
    member_id: str,
    data: PropertyGroupMemberUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member ID format")
    member = await db.get(PropertyGroupMember, member_uuid)
    if not member or str(member.group_id) != group_id:
        raise HTTPException(status_code=404, detail="Group member not found")

    if data.is_whole_property:
        whole = await db.execute(
            select(PropertyGroupMember)
            .where(PropertyGroupMember.group_id == group_id, PropertyGroupMember.is_whole_property == True)
        )
        existing = whole.scalar_one_or_none()
        if existing and existing.id != member.id:
            raise HTTPException(status_code=409, detail="Group already has a whole-property listing")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(member, key, val)

    await db.commit()
    return await fetch_group(db, group_id)


@router.put("/groups/{group_id}", response_model=PropertyGroupOut)
async def update_group(
    group_id: str,
    data: PropertyGroupCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid group ID format")
    group = await db.get(PropertyGroup, group_uuid)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.name = data.name
    await db.commit()
    return await fetch_group(db, group_id)


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid group ID format")
    group = await db.get(PropertyGroup, group_uuid)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)
    await db.commit()
    return {"message": "Group deleted"}


# ── Admin Calendar & Date Blocking ────────────────────────────────────────────

@router.get("/properties/{property_id}/calendar", response_model=CalendarOut)
async def get_property_calendar(
    property_id: str,
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return all calendar events (bookings, admin blocks, shadow blocks) for a property."""
    # Default to a 3-month window centred on today
    if from_date is None:
        from_date = date.today().replace(day=1) - timedelta(days=1)
        from_date = from_date.replace(day=1)  # first of previous month
    if to_date is None:
        to_date = (date.today().replace(day=1) + timedelta(days=62)).replace(day=1) - timedelta(days=1)

    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    result = await db.execute(
        select(Booking).where(
            Booking.property_id == prop_uuid,
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.pending, BookingStatus.completed]),
            Booking.check_in < to_date,
            Booking.check_out > from_date,
        )
    )
    bookings = result.scalars().all()

    events: list[CalendarEventOut] = []
    for b in bookings:
        if b.is_admin_block:
            event_type = "admin_block"
        elif b.is_shadow_block:
            event_type = "shadow_block"
        else:
            event_type = "guest_booking"

        # For shadow blocks, resolve the parent booking ref
        parent_ref: str | None = None
        if b.is_shadow_block and b.parent_booking_id:
            parent = await db.get(Booking, b.parent_booking_id)
            parent_ref = parent.booking_ref if parent else None

        events.append(CalendarEventOut(
            id=b.id,
            type=event_type,
            check_in=b.check_in,
            check_out=b.check_out,
            guest_name=b.guest_name if not b.is_admin_block else None,
            guest_email=b.guest_email if not b.is_admin_block else None,
            booking_ref=b.booking_ref if not b.is_admin_block else None,
            total=b.total if not b.is_admin_block else None,
            status=b.status.value if not b.is_admin_block else None,
            payment_status=b.payment_status.value if not b.is_admin_block else None,
            note=b.note,
            parent_booking_ref=parent_ref,
        ))

    # Also query price overrides for the window
    overrides_res = await db.execute(
        select(PropertyPriceOverride).where(
            PropertyPriceOverride.property_id == prop_uuid,
            PropertyPriceOverride.start_date < to_date,
            PropertyPriceOverride.end_date > from_date,
        ).order_by(PropertyPriceOverride.start_date)
    )
    overrides = overrides_res.scalars().all()
    price_overrides_out = [PriceOverrideOut.model_validate(ov) for ov in overrides]

    return CalendarOut(events=events, price_overrides=price_overrides_out)


@router.post("/properties/{property_id}/blocks", response_model=CalendarEventOut, status_code=201)
async def create_admin_block(
    property_id: str,
    data: AdminBlockCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create an admin date block. Automatically shadow-blocks grouped sibling properties."""
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    property_obj = await db.get(Property, prop_uuid)
    if not property_obj:
        raise HTTPException(status_code=404, detail="Property not found")

    # Check for overlap with real guest bookings on this property
    overlap_result = await db.execute(
        select(Booking).where(
            Booking.property_id == prop_uuid,
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.pending]),
            Booking.is_admin_block == False,  # Only check real guest bookings
            Booking.check_in < data.check_out,
            Booking.check_out > data.check_in,
        )
    )
    conflicting = overlap_result.scalars().first()
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail=f"Dates overlap with an existing guest booking: {conflicting.booking_ref}",
        )

    nights = (data.check_out - data.check_in).days

    block = Booking(
        id=uuid.uuid4(),
        property_id=uuid.UUID(property_id),
        guest_id=admin.id,
        check_in=data.check_in,
        check_out=data.check_out,
        guests=1,
        pets=0,
        nights=nights,
        base_price=0,
        cleaning_fee=0,
        pet_charge=0,
        total=0,
        status=BookingStatus.confirmed,
        payment_status=PaymentStatus.unpaid,
        is_admin_block=True,
        is_shadow_block=False,
        note=data.note,
        guest_name="Admin Block",
        guest_email="admin@conceptstay.com",
    )
    db.add(block)
    await db.flush()  # Populate block.id before group blocking
    await apply_group_blocking(db, block, commit=False)
    await db.commit()
    await db.refresh(block)

    return CalendarEventOut(
        id=block.id,
        type="admin_block",
        check_in=block.check_in,
        check_out=block.check_out,
        note=block.note,
    )


@router.delete("/properties/{property_id}/blocks/{block_id}")
async def delete_admin_block(
    property_id: str,
    block_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an admin date block and remove all associated group shadow blocks."""
    try:
        block_uuid = uuid.UUID(block_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid block ID format")
    block = await db.get(Booking, block_uuid)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    if str(block.property_id) != property_id:
        raise HTTPException(status_code=404, detail="Block not found for this property")
    if not block.is_admin_block:
        raise HTTPException(
            status_code=403,
            detail="Cannot delete a guest booking through this endpoint",
        )

    await remove_shadow_blocks(db, block, commit=False)
    await db.delete(block)
    await db.commit()
    return {"message": "Block removed"}


# ── Price Overrides ───────────────────────────────────────────────────────────

@router.get("/properties/{property_id}/price-overrides", response_model=list[PriceOverrideOut])
async def list_price_overrides(
    property_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all price overrides for a property."""
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    result = await db.execute(
        select(PropertyPriceOverride)
        .where(PropertyPriceOverride.property_id == prop_uuid)
        .order_by(PropertyPriceOverride.start_date.asc())
    )
    overrides = result.scalars().all()
    return overrides


@router.post("/properties/{property_id}/price-overrides", response_model=PriceOverrideOut, status_code=201)
async def create_price_override(
    property_id: str,
    data: PriceOverrideCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a price override for a date range."""
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    if data.end_date <= data.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    if data.discount_percent is not None:
        if not (1 <= data.discount_percent <= 90):
            raise HTTPException(status_code=400, detail="Discount percentage must be between 1% and 90%")
    elif data.price_per_night is None or data.price_per_night <= 0:
        raise HTTPException(status_code=400, detail="Either price_per_night or discount_percent is required")

    property_obj = await db.get(Property, prop_uuid)
    if not property_obj:
        raise HTTPException(status_code=404, detail="Property not found")

    if data.discount_percent is not None:
        # Calculate discounted price from base property price
        effective_price = max(1, int(round(property_obj.price_per_night * (1.0 - data.discount_percent / 100.0))))
        default_tag = f"{data.discount_percent}% OFF"
        effective_label = f"{data.label.strip()} ({default_tag})" if data.label and data.label.strip() else default_tag
    else:
        effective_price = data.price_per_night
        effective_label = data.label.strip() if data.label else None

    # Check for existing overlapping overrides
    overlap_res = await db.execute(
        select(PropertyPriceOverride).where(
            PropertyPriceOverride.property_id == prop_uuid,
            PropertyPriceOverride.start_date < data.end_date,
            PropertyPriceOverride.end_date > data.start_date,
        )
    )
    if overlap_res.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="A price override already exists for these dates. Please remove the existing override first."
        )

    override = PropertyPriceOverride(
        property_id=prop_uuid,
        start_date=data.start_date,
        end_date=data.end_date,
        price_per_night=effective_price,
        discount_percent=data.discount_percent,
        label=effective_label,
    )
    db.add(override)
    await db.commit()
    await db.refresh(override)

    try:
        await invalidate_properties_cache()
    except Exception:
        pass

    return override


@router.delete("/properties/{property_id}/price-overrides/{override_id}")
async def delete_price_override(
    property_id: str,
    override_id: str,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a price override."""
    try:
        prop_uuid = uuid.UUID(property_id)
        override_uuid = uuid.UUID(override_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    override = await db.get(PropertyPriceOverride, override_uuid)
    if not override:
        raise HTTPException(status_code=404, detail="Price override not found")
    if override.property_id != prop_uuid:
        raise HTTPException(status_code=404, detail="Price override not found for this property")

    await db.delete(override)
    await db.commit()

    try:
        await invalidate_properties_cache()
    except Exception:
        pass

    return {"message": "Price override removed"}

# -- Hosts ---------------------------------------------------------------------

@router.get("/hosts", response_model=list[UserOut])
async def list_hosts(admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.role == UserRole.host).order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/hosts/{user_id}", response_model=UserOut)
async def update_host_status(
    user_id: uuid.UUID,
    data: HostStatusUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    host = await db.get(User, user_id)
    if not host or host.role != UserRole.host:
        raise HTTPException(status_code=404, detail="Host not found")
    host.host_status = HostStatus(data.host_status)
    await db.commit()
    await db.refresh(host)
    await cache_delete(f"user:{host.id}")
    await invalidate_properties_cache()
    return host


# -- Operators -----------------------------------------------------------------

@router.get("/operators", response_model=list[UserOut])
async def list_operators(admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.role == UserRole.operator).order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/operators/{user_id}", response_model=UserOut)
async def update_operator_status(
    user_id: uuid.UUID,
    data: OperatorStatusUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    operator = await db.get(User, user_id)
    if not operator or operator.role != UserRole.operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    operator.operator_status = OperatorStatus(data.operator_status)
    await db.commit()
    await db.refresh(operator)
    await cache_delete(f"user:{operator.id}")
    await invalidate_properties_cache()
    return operator


# -- Listing review (host submissions) ---------------------------------------------

async def _get_property_or_404(db: AsyncSession, property_id: str) -> Property:
    try:
        prop_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")
    result = await db.execute(
        select(Property).options(selectinload(Property.images)).where(Property.id == prop_uuid)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.get("/review-queue", response_model=list[HostPropertyOut])
async def review_queue(admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where((Property.approval_status == "pending_review") | (Property.pending_changes.isnot(None)))
        .order_by(Property.updated_at.asc())
    )
    return result.scalars().all()


@router.post("/properties/{property_id}/approve", response_model=HostPropertyOut)
async def approve_listing(property_id: str, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    prop = await _get_property_or_404(db, property_id)
    await listing_review.approve_listing(db, prop)
    await db.commit()
    await invalidate_properties_cache()
    return await _get_property_or_404(db, property_id)


@router.post("/properties/{property_id}/reject", response_model=HostPropertyOut)
async def reject_listing(
    property_id: str,
    data: RejectListingIn,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    prop = await _get_property_or_404(db, property_id)
    listing_review.reject_listing(prop, data.reason)
    await db.commit()
    await invalidate_properties_cache()
    return await _get_property_or_404(db, property_id)


@router.patch("/properties/{property_id}/verification", response_model=HostPropertyOut)
async def update_verification(
    property_id: str,
    data: VerificationUpdateIn,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    prop = await _get_property_or_404(db, property_id)
    listing_review.set_verification(prop, data.status)
    await db.commit()
    await invalidate_properties_cache()
    return await _get_property_or_404(db, property_id)
