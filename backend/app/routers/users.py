from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.services.cache import cache_delete
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.booking import Booking, BookingStatus
from app.schemas.user import DashboardOut, UserOut, UserUpdate, PasswordChange
from app.services.auth import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upcoming = await db.execute(
        select(func.count(Booking.id)).where(
            Booking.guest_id == user.id,
            Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
        )
    )
    past = await db.execute(
        select(func.count(Booking.id)).where(
            Booking.guest_id == user.id,
            Booking.status == BookingStatus.completed,
        )
    )
    spent = await db.execute(
        select(func.coalesce(func.sum(Booking.total), 0)).where(
            Booking.guest_id == user.id,
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.completed]),
        )
    )
    return {
        "upcoming_bookings": upcoming.scalar() or 0,
        "past_stays": past.scalar() or 0,
        "total_spent": spent.scalar() or 0,
        "profile": user,
    }


@router.patch("/profile", response_model=UserOut)
async def update_profile(data: UserUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.open_to_connections is not None:
        user.open_to_connections = data.open_to_connections
    await db.commit()
    await db.refresh(user)
    await cache_delete(f"user:{user.id}")  # the cached copy would otherwise serve the old profile for a minute
    return user


@router.patch("/password")
async def change_password(
    data: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"message": "Password changed"}