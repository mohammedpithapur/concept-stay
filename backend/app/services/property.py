from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import selectinload
from app.models.property import Property
from app.models.review import Review
from app.models.booking import Booking, BookingStatus
from app.models.user import HostStatus, User
from app.taxonomy import CATEGORIES, CATEGORY_LABELS

PRICE_UNBOUNDED_FROM = 50000  # the "Rs 50,000+" slider stop means no upper limit

SORT_ORDERS = {
    "newest": lambda: Property.created_at.desc(),
    "price_asc": lambda: Property.price_per_night.asc(),
    "price_desc": lambda: Property.price_per_night.desc(),
    "rating": lambda: Property.avg_rating.desc(),
}


def _jsonb_has_any(column, values: list[str]):
    """JSONB array/key contains ANY of values (the ?| operator, with a proper text[] parameter)."""
    return func.jsonb_exists_any(column, cast(values, ARRAY(Text)))


def public_listing_clauses() -> list:
    """Conditions every guest-facing query must apply: live, approved, not suspended, host in good standing."""
    suspended_hosts = select(User.id).where(User.host_status == HostStatus.suspended)
    return [
        Property.is_published == True,  # noqa: E712
        Property.approval_status == "approved",
        Property.verification_status != "suspended",
        Property.owner_id.notin_(suspended_hosts),
    ]


async def get_property_filters(
    db: AsyncSession,
    city: str | None = None,
    state: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    guests: int | None = None,
    pets_allowed: bool | None = None,
    amenities: list[str] | None = None,
    check_in: str | None = None,
    check_out: str | None = None,
    page: int = 1,
    limit: int = 12,
    destination: str | None = None,
    property_type: list[str] | None = None,
    category: str | None = None,
    experience: list[str] | None = None,
    verified_only: bool = False,
    sort: str = "newest",
):
    base = select(Property).where(*public_listing_clauses())
    if destination:
        like = f"%{destination}%"
        base = base.where(or_(Property.city.ilike(like), Property.state.ilike(like)))
    if property_type:
        base = base.where(Property.property_type.in_(property_type))
    if category:
        base = base.where(Property.categories.contains([category]))
    if experience:
        base = base.where(_jsonb_has_any(Property.experience_tags, experience))
    if verified_only:
        base = base.where(Property.verification_status == "verified")

    if city:
        base = base.where(Property.city.ilike(f"%{city}%"))
    if state:
        base = base.where(Property.state.ilike(f"%{state}%"))
    if min_price is not None:
        base = base.where(Property.price_per_night >= min_price)
    if max_price is not None and max_price < PRICE_UNBOUNDED_FROM:
        base = base.where(Property.price_per_night <= max_price)
    if guests is not None:
        base = base.where(Property.max_guests >= guests)
    if pets_allowed is not None:
        base = base.where(Property.pets_allowed == pets_allowed)
    if amenities:
        base = base.where(_jsonb_has_any(Property.amenities, amenities))

    # ── Availability filter: exclude properties booked in requested range ──
    if check_in and check_out:
        try:
            from datetime import date
            ci = date.fromisoformat(check_in)
            co = date.fromisoformat(check_out)
            if ci < co:
                # A booking overlaps if: booking.check_in < check_out AND booking.check_out > check_in
                booked_ids_query = (
                    select(Booking.property_id)
                    .where(
                        Booking.status.in_([BookingStatus.confirmed, BookingStatus.pending]),
                        Booking.check_in < co,
                        Booking.check_out > ci,
                    )
                    .distinct()
                )
                booked_result = await db.execute(booked_ids_query)
                booked_ids = [row[0] for row in booked_result.all()]
                if booked_ids:
                    base = base.where(Property.id.notin_(booked_ids))
        except (ValueError, Exception):
            pass  # Invalid dates — skip availability filter gracefully

    # Count total before pagination
    count_query = select(func.count()).select_from(base.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginate with eager-loaded images
    offset = (page - 1) * limit
    query = base.options(selectinload(Property.images)).offset(offset).limit(limit).order_by(SORT_ORDERS.get(sort, SORT_ORDERS['newest'])())

    result = await db.execute(query)
    properties = result.scalars().all()

    resolved_properties = await apply_properties_inheritance(db, list(properties))

    return {"items": resolved_properties, "total": total, "page": page, "limit": limit}


async def update_property_rating(db: AsyncSession, property_id: str):
    """Recalculate denormalized rating after review changes."""
    result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.property_id == property_id)
    )
    avg_rating, count = result.one()
    prop = await db.get(Property, property_id)
    if prop:
        prop.avg_rating = round(float(avg_rating), 1) if avg_rating else 0.0
        prop.review_count = count
        await db.commit()


import copy
from app.models.property_group import PropertyGroupMember

async def apply_property_inheritance(db: AsyncSession, property_obj: Property) -> Property:
    if not property_obj:
        return property_obj

    # Check if property belongs to any group
    group_member_res = await db.execute(
        select(PropertyGroupMember).where(PropertyGroupMember.property_id == property_obj.id)
    )
    membership = group_member_res.scalar_one_or_none()
    if not membership:
        return property_obj

    # Find the "Whole Property" listing in the group
    whole_prop_res = await db.execute(
        select(Property)
        .options(selectinload(Property.images))
        .join(PropertyGroupMember, PropertyGroupMember.property_id == Property.id)
        .where(
            PropertyGroupMember.group_id == membership.group_id,
            PropertyGroupMember.is_whole_property == True
        )
    )
    whole_property = whole_prop_res.scalar_one_or_none()
    if not whole_property or whole_property.id == property_obj.id:
        return property_obj

    # Clone property_obj to prevent modifying the database state
    cloned = copy.copy(property_obj)
    cloned.images = list(property_obj.images)

    # Apply inheritance where override is False
    if not cloned.override_house_rules:
        cloned.house_rules = whole_property.house_rules
    if not cloned.override_amenities:
        cloned.amenities = whole_property.amenities
    if not cloned.override_details:
        cloned.description = whole_property.description
        cloned.address = whole_property.address
        cloned.city = whole_property.city
        cloned.state = whole_property.state
        cloned.country = whole_property.country
        cloned.latitude = whole_property.latitude
        cloned.longitude = whole_property.longitude
        cloned.contact_phone = whole_property.contact_phone
        cloned.contact_email = whole_property.contact_email
        cloned.check_in_time = whole_property.check_in_time
        cloned.check_out_time = whole_property.check_out_time

    return cloned


async def apply_properties_inheritance(db: AsyncSession, properties: list[Property]) -> list[Property]:
    if not properties:
        return properties

    property_ids = [p.id for p in properties]
    
    # 1. Fetch group memberships in a single query
    memberships_res = await db.execute(
        select(PropertyGroupMember).where(PropertyGroupMember.property_id.in_(property_ids))
    )
    memberships = memberships_res.scalars().all()
    if not memberships:
        return properties

    membership_map = {m.property_id: m for m in memberships}
    group_ids = list(set(m.group_id for m in memberships))

    # 2. Fetch all "Whole Property" listings for these groups in a single query
    whole_props_res = await db.execute(
        select(Property, PropertyGroupMember.group_id)
        .options(selectinload(Property.images))
        .join(PropertyGroupMember, PropertyGroupMember.property_id == Property.id)
        .where(
            PropertyGroupMember.group_id.in_(group_ids),
            PropertyGroupMember.is_whole_property == True
        )
    )
    whole_props_rows = whole_props_res.all()
    whole_prop_by_group = {group_id: prop for prop, group_id in whole_props_rows}

    # 3. Apply inheritance
    resolved_properties = []
    for p in properties:
        membership = membership_map.get(p.id)
        if not membership:
            resolved_properties.append(p)
            continue

        whole_property = whole_prop_by_group.get(membership.group_id)
        if not whole_property or whole_property.id == p.id:
            resolved_properties.append(p)
            continue

        cloned = copy.copy(p)
        cloned.images = list(p.images)
        child_spaces = p.spaces_detail

        if not cloned.override_house_rules:
            cloned.house_rules = whole_property.house_rules
        if not cloned.override_amenities:
            cloned.amenities = whole_property.amenities
            if child_spaces:
                cloned.spaces_detail = child_spaces
        if not cloned.override_details:
            cloned.description = whole_property.description
            cloned.address = whole_property.address
            cloned.city = whole_property.city
            cloned.state = whole_property.state
            cloned.country = whole_property.country
            cloned.latitude = whole_property.latitude
            cloned.longitude = whole_property.longitude
            cloned.contact_phone = whole_property.contact_phone
            cloned.contact_email = whole_property.contact_email
            cloned.check_in_time = whole_property.check_in_time
            cloned.check_out_time = whole_property.check_out_time

        resolved_properties.append(cloned)

    return resolved_properties