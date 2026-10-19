from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, select, func, delete
from uuid import UUID

from app.database import get_db, today_ist, utc_now
from app.dependencies import get_admin, get_current_user
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.user import User
from app.models.property import Property
from app.models.review import Review
from app.schemas.review import ReviewCreate, ReviewOut, VerifiedReviewIn

router = APIRouter(tags=["reviews"])


async def recalculate_property_ratings(db: AsyncSession, property_id: UUID):
    """Calculate and update avg_rating and review_count individually for the given property."""
    stats_res = await db.execute(
        select(func.count(Review.id), func.avg(Review.rating)).where(
            Review.property_id == property_id
        )
    )
    count, avg_rating = stats_res.fetchone()

    count = count or 0
    avg_rating = round(float(avg_rating), 2) if avg_rating is not None else 0.0

    prop = await db.get(Property, property_id)
    if prop:
        prop.avg_rating = avg_rating
        prop.review_count = count
        db.add(prop)

    await db.commit()


@router.get("/properties/{property_id}/reviews", response_model=list[ReviewOut])
async def get_property_reviews(property_id: UUID, db: AsyncSession = Depends(get_db)):
    """Retrieve all reviews belonging to this individual property."""
    reviews_res = await db.execute(
        select(Review)
        .where(Review.property_id == property_id)
        .order_by(Review.created_at.desc())
    )
    return reviews_res.scalars().all()


@router.post("/admin/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_admin_review(
    data: ReviewCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    # Verify property exists
    prop = await db.get(Property, data.property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    review = Review(
        property_id=data.property_id,
        guest_name=data.guest_name,
        rating=data.rating,
        comment=data.comment,
        platform=data.platform,
        created_at=data.created_at or utc_now(),
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)

    # Recalculate ratings
    await recalculate_property_ratings(db, data.property_id)
    
    # Reload from DB to ensure relationships are clean
    await db.refresh(review)
    return review


@router.delete("/admin/reviews/{review_id}", status_code=status.HTTP_200_OK)
async def delete_admin_review(
    review_id: UUID,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    property_id = review.property_id
    await db.delete(review)
    await db.commit()

    # Recalculate ratings
    await recalculate_property_ratings(db, property_id)
    return {"message": "Review deleted successfully"}


@router.patch("/admin/reviews/{review_id}", response_model=ReviewOut)
async def update_admin_review(
    review_id: UUID,
    data: dict,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    allowed_fields = {"guest_name", "rating", "comment", "platform"}
    for field, value in data.items():
        if field in allowed_fields:
            setattr(review, field, value)

    await db.commit()
    await db.refresh(review)
    await recalculate_property_ratings(db, review.property_id)
    await db.refresh(review)
    return review


# -- Verified-guest reviews ----------------------------------------------------------

REVIEW_CATEGORIES = ("cleanliness", "location", "comfort", "hospitality", "accuracy")


@router.post("/bookings/{booking_id}/review", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_verified_review(
    booking_id: UUID,
    data: VerifiedReviewIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Only the guest of a finished stay may review it, once.

    Finished = marked completed by an admin, or paid + confirmed with the check-out date already passed.
    """
    booking = await db.get(Booking, booking_id, with_for_update=True)
    if not booking or booking.is_admin_block or booking.is_shadow_block:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.guest_id != user.id:
        raise HTTPException(status_code=403, detail="Only the guest of this booking can review it")
    stay_over = booking.status == BookingStatus.completed or (
        booking.status == BookingStatus.confirmed
        and booking.payment_status == PaymentStatus.paid
        and booking.check_out <= today_ist()
    )
    if not stay_over:
        raise HTTPException(status_code=409, detail="You can review a stay after it has been completed")
    if await db.scalar(select(Review.id).where(Review.booking_id == booking.id)):
        raise HTTPException(status_code=409, detail="This booking has already been reviewed")

    scores = [getattr(data, c) for c in REVIEW_CATEGORIES]
    review = Review(
        property_id=booking.property_id,
        guest_id=user.id,
        booking_id=booking.id,
        guest_name=booking.guest_name,
        platform="Concept Stay",
        rating=(sum(scores) * 2 + len(scores)) // (2 * len(scores)),  # mean, rounded half up
        comment=data.comment,
        would_recommend=data.would_recommend,
        **{c: getattr(data, c) for c in REVIEW_CATEGORIES},
    )
    db.add(review)
    booking.status = BookingStatus.completed
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This booking has already been reviewed")
    await db.refresh(review)
    await recalculate_property_ratings(db, booking.property_id)
    await db.refresh(review)
    return review


@router.get("/properties/{property_id}/review-summary")
async def get_review_summary(property_id: UUID, db: AsyncSession = Depends(get_db)):
    """Overall score, per-category averages and the share of guests who would recommend the stay."""
    columns = [func.count(Review.id), func.avg(Review.rating)]
    columns += [func.avg(getattr(Review, c)) for c in REVIEW_CATEGORIES]
    columns += [
        func.count(Review.would_recommend),
        func.sum(case((Review.would_recommend.is_(True), 1), else_=0)),
    ]
    row = (await db.execute(select(*columns).where(Review.property_id == property_id))).one()
    count, overall = row[0], row[1]
    cat_avgs = row[2:2 + len(REVIEW_CATEGORIES)]
    answered, recommended = row[-2], row[-1]
    return {
        "count": count,
        "overall": round(float(overall), 1) if overall is not None else 0.0,
        "recommend_percent": round(100 * int(recommended or 0) / answered) if answered else None,
        "categories": {
            c: round(float(v), 1) for c, v in zip(REVIEW_CATEGORIES, cat_avgs) if v is not None
        },
    }
