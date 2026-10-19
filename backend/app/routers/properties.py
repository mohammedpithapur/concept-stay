import hashlib
from datetime import date
import json
import uuid

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_optional_current_user
from app.models.booking import Booking, BookingStatus
from app.models.property import Property
from app.models.user import User, UserRole
from app.models.price_override import PropertyPriceOverride
from app.schemas.price_override import PriceOverrideOut
from app.schemas.property import PropertyListOut, PropertyOut
from app.services.booking import calculate_pricing
from app.services.property import apply_property_inheritance, get_property_filters, public_listing_clauses
from app.taxonomy import CATEGORIES, CATEGORY_LABELS
from app.services.cache import cache_get_json, cache_set_json
from app.services.booking import auto_cleanup_expired_bookings

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=PropertyListOut)
async def list_properties(
    city: str | None = Query(None),
    state: str | None = Query(None),
    min_price: int | None = Query(None),
    max_price: int | None = Query(None),
    guests: int | None = Query(None),
    pets_allowed: bool | None = Query(None),
    amenities: str | None = Query(None),  # comma-separated
    check_in: str | None = Query(None),   # YYYY-MM-DD — exclude booked properties
    check_out: str | None = Query(None),  # YYYY-MM-DD — exclude booked properties
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=200),
    destination: str | None = Query(None),
    property_type: str | None = Query(None),  # comma-separated
    category: str | None = Query(None),
    experience: str | None = Query(None),     # comma-separated
    verified_only: bool = Query(False),
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc|rating)$"),
    db: AsyncSession = Depends(get_db),
):
    try:
        await auto_cleanup_expired_bookings(db)
    except Exception:
        pass

    cache_payload = {
        "city": city,
        "state": state,
        "min_price": min_price,
        "max_price": max_price,
        "guests": guests,
        "pets_allowed": pets_allowed,
        "amenities": amenities,
        "check_in": check_in,
        "check_out": check_out,
        "page": page,
        "limit": limit,
        "destination": destination,
        "property_type": property_type,
        "category": category,
        "experience": experience,
        "verified_only": verified_only,
        "sort": sort,
    }
    cache_hash = hashlib.sha256(json.dumps(cache_payload, sort_keys=True).encode()).hexdigest()
    cache_key = f"properties:list:{cache_hash}"
    try:
        cached = await cache_get_json(cache_key)
        if cached and isinstance(cached, dict) and "items" in cached:
            return cached
    except Exception:
        pass

    amenity_list = amenities.split(",") if amenities else None
    result = await get_property_filters(
        db, city=city, state=state, min_price=min_price, max_price=max_price,
        guests=guests, pets_allowed=pets_allowed, amenities=amenity_list,
        check_in=check_in, check_out=check_out,
        page=page, limit=limit,
        destination=destination,
        property_type=property_type.split(",") if property_type else None,
        category=category,
        experience=experience.split(",") if experience else None,
        verified_only=verified_only, sort=sort,
    )
    response = PropertyListOut.model_validate(result).model_dump(mode="json")
    try:
        await cache_set_json(cache_key, response, ttl_seconds=300)
    except Exception:
        pass
    return response


@router.get("/locations")
async def get_unique_locations(db: AsyncSession = Depends(get_db)):
    cache_key = "properties:locations:list"
    cached = await cache_get_json(cache_key)
    if cached:
        return cached

    query = select(Property.city, Property.state).where(*public_listing_clauses()).distinct()
    result = await db.execute(query)
    rows = result.all()
    
    locations = []
    seen = set()
    for row in rows:
        city_str = (row.city or "").strip()
        state_str = (row.state or "").strip()
        if not city_str:
            continue
        key = (city_str.lower(), state_str.lower())
        if key not in seen:
            seen.add(key)
            locations.append({"city": city_str, "state": state_str})
            
    response = {"locations": locations}
    await cache_set_json(cache_key, response, ttl_seconds=3600)
    return response



@router.get("/destinations")
async def list_destinations(db: AsyncSession = Depends(get_db)):
    """Distinct state/city pairs of publicly visible listings with counts."""
    result = await db.execute(
        select(Property.state, Property.city, func.count(Property.id))
        .where(*public_listing_clauses())
        .group_by(Property.state, Property.city)
        .order_by(func.count(Property.id).desc(), Property.state, Property.city)
    )
    return [{"state": s, "city": c, "count": n} for s, c, n in result.all()]


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    """All curated categories with the number of publicly visible listings in each."""
    result = await db.execute(select(Property.categories).where(*public_listing_clauses()))
    counts = {slug: 0 for slug in CATEGORIES}
    for (cats,) in result.all():
        for slug in set(cats or []):
            if slug in counts:
                counts[slug] += 1
    return [{"slug": slug, "label": CATEGORY_LABELS[slug], "count": counts[slug]} for slug in CATEGORIES]


@router.get("/featured", response_model=list[PropertyOut])
async def list_featured_properties(
    db: AsyncSession = Depends(get_db),
):
    """
    Return up to 8 admin-featured published properties.
    Falls back to the 6 highest-rated published properties when none are featured.
    """
    cache_key = "properties:featured"
    try:
        cached = await cache_get_json(cache_key)
        if cached and isinstance(cached, list):
            return cached
    except Exception:
        pass

    # Try featured first
    result = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .where(*public_listing_clauses(), Property.is_featured == True)
        .order_by(Property.avg_rating.desc())
        .limit(8)
    )
    properties = list(result.scalars().all())

    # Fallback: top-rated published properties
    if not properties:
        result = await db.execute(
            select(Property)
            .options(selectinload(Property.images))
            .where(*public_listing_clauses())
            .order_by(Property.avg_rating.desc())
            .limit(6)
        )
        properties = list(result.scalars().all())

    # Apply group inheritance for each property
    inherited = []
    for p in properties:
        try:
            inherited.append(await apply_property_inheritance(db, p))
        except Exception:
            inherited.append(PropertyOut.model_validate(p))

    response = [PropertyOut.model_validate(p).model_dump(mode="json") if not isinstance(p, PropertyOut) else p.model_dump(mode="json") for p in inherited]
    try:
        await cache_set_json(cache_key, response, ttl_seconds=300)
    except Exception:
        pass
    return response


@router.get("/{property_id}", response_model=PropertyOut)
async def get_property(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    try:
        target_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    query = select(Property).options(selectinload(Property.images)).where(Property.id == target_uuid)
    is_admin = current_user is not None and current_user.role == UserRole.admin
    if not is_admin:
        query = query.where(*public_listing_clauses())

    result = await db.execute(query)
    property = result.scalar_one_or_none()
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")
    
    return await apply_property_inheritance(db, property)


@router.get("/{property_id}/quote")
async def get_property_quote(
    property_id: str,
    check_in: date,
    check_out: date,
    guests: int = Query(1, ge=1),
    pets: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Server-side price breakdown (nightly rates, taxes, fees, total) for a prospective stay."""
    try:
        target_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")
    if check_out <= check_in:
        raise HTTPException(status_code=400, detail="check_out must be after check_in")
    prop = await db.scalar(select(Property).where(Property.id == target_uuid, *public_listing_clauses()))
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    overrides = (
        await db.execute(
            select(PropertyPriceOverride).where(
                PropertyPriceOverride.property_id == target_uuid,
                PropertyPriceOverride.start_date < check_out,
                PropertyPriceOverride.end_date > check_in,
            )
        )
    ).scalars().all()
    return calculate_pricing(prop, check_in, check_out, pets, guests, price_overrides=list(overrides))


@router.get("/{property_id}/availability")
async def get_property_availability(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    # Validate UUID first before doing any DB work
    try:
        target_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    # Auto-cleanup only after UUID is valid
    try:
        await auto_cleanup_expired_bookings(db)
    except Exception:
        pass

    query = select(Property.id).where(Property.id == target_uuid)
    is_admin = current_user is not None and current_user.role == UserRole.admin
    if not is_admin:
        query = query.where(*public_listing_clauses())

    result = await db.execute(query)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Property not found")

    result = await db.execute(
        select(Booking.check_in, Booking.check_out).where(
            Booking.property_id == target_uuid,
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.pending]),
        )
    )
    return [
        {"check_in": check_in, "check_out": check_out}
        for check_in, check_out in result.all()
    ]


@router.get("/{property_id}/price-overrides", response_model=list[PriceOverrideOut])
async def get_public_price_overrides(
    property_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        target_uuid = uuid.UUID(property_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid property ID format")

    result = await db.execute(
        select(PropertyPriceOverride)
        .where(PropertyPriceOverride.property_id == target_uuid)
        .order_by(PropertyPriceOverride.start_date.asc())
    )
    return result.scalars().all()

