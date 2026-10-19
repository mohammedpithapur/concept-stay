"""
Push notification router.
  GET  /push/vapid-public-key  → returns VAPID public key for frontend
  POST /push/subscribe         → save browser subscription (auth required)
  DELETE /push/unsubscribe     → remove subscription (auth required)
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.push_subscription import PushSubscription
from app.models.user import User

router = APIRouter(prefix="/push", tags=["push"])


class SubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Returns the VAPID public key for the frontend to subscribe."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=201)
async def subscribe(
    data: SubscribeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a browser push subscription for the authenticated user."""
    # Upsert: update if endpoint already exists, otherwise create
    existing = await db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    if existing:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        existing.user_id = user.id
    else:
        sub = PushSubscription(
            id=uuid.uuid4(),
            user_id=user.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        )
        db.add(sub)
    await db.commit()
    return {"status": "subscribed"}


@router.delete("/unsubscribe")
async def unsubscribe(
    data: SubscribeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a push subscription."""
    sub = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == data.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    if sub:
        await db.delete(sub)
        await db.commit()
    return {"status": "unsubscribed"}


@router.post("/test")
async def test_notification(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test push notification to the authenticated user's registered devices."""
    from app.services.push import send_push_to_user

    is_admin = getattr(user, "role", None) and user.role.value == "admin"
    title = "Concept Stay Admin Notification" if is_admin else "Concept Stay Notifications"
    body = (
        "Push notifications are working properly on this device! 🔔"
        if is_admin
        else "You will now receive booking updates and stay reminders on this device! 🏡"
    )
    url = "/admin" if is_admin else "/dashboard"

    sent_count = await send_push_to_user(
        user_id=user.id,
        title=title,
        body=body,
        url=url,
        db=db,
    )
    return {"status": "sent", "devices_notified": sent_count}
