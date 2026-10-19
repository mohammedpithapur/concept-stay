"""Property image persistence helpers shared by the admin and host routers."""
import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property import PropertyImage
from app.schemas.property import PropertyImageCreate
from app.services.upload import (
    UploadStorageError,
    UploadValidationError,
    upload_property_image_from_data_url,
)


async def sync_property_images(db: AsyncSession, property_id_val: uuid.UUID | str, images: list[PropertyImageCreate] | None) -> None:
    """Replace all images for a property. Deletes old DB records (storage files deleted separately by caller)."""
    if images is None:
        return

    prop_uuid = property_id_val if isinstance(property_id_val, uuid.UUID) else uuid.UUID(str(property_id_val))

    # Bulk delete all existing image records for this property
    await db.execute(delete(PropertyImage).where(PropertyImage.property_id == prop_uuid))

    if not images:
        return

    # Filter out any blob: or empty URLs that should never reach the DB
    valid_images = [img for img in images if img.image_url and not img.image_url.startswith("blob:")]

    if not valid_images:
        return

    normalized_images = []
    primary_assigned = False
    for index, image_data in enumerate(valid_images):
        is_primary = bool(image_data.is_primary) and not primary_assigned
        primary_assigned = primary_assigned or is_primary
        album_name = getattr(image_data, "album_name", "General") or "General"
        normalized_images.append(
            PropertyImage(
                property_id=prop_uuid,
                image_url=image_data.image_url,
                is_primary=is_primary,
                display_order=image_data.display_order or index + 1,
                album_name=album_name,
            )
        )

    if not primary_assigned and normalized_images:
        normalized_images[0].is_primary = True

    db.add_all(normalized_images)


async def normalize_property_images(images: list[PropertyImageCreate] | None) -> list[PropertyImageCreate] | None:
    if images is None:
        return None

    normalized: list[PropertyImageCreate] = []
    for image in images:
        image_url = image.image_url
        # Skip blob: URLs — they should have been uploaded client-side already
        if image_url.startswith("blob:"):
            continue
        if image_url.startswith("data:image"):
            try:
                # Run blocking upload in a thread to avoid blocking the event loop
                image_url = await asyncio.to_thread(upload_property_image_from_data_url, image_url)
            except UploadValidationError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except UploadStorageError as exc:
                raise HTTPException(status_code=500, detail=f"Image upload failed: {exc}") from exc

        album_name = getattr(image, "album_name", "General") or "General"
        normalized.append(
            PropertyImageCreate(
                image_url=image_url,
                is_primary=image.is_primary,
                display_order=image.display_order,
                album_name=album_name,
            )
        )

    return normalized
