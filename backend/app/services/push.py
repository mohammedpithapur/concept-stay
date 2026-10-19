"""
Web Push notification service using pywebpush + VAPID.
Supports sending push to:
  - all admin devices (send_push_to_admins)
  - a specific user's devices (send_push_to_user)
  - all subscribed devices (send_push_to_all)
"""
import asyncio
import json
import logging
import uuid
from typing import Sequence

from pywebpush import webpush, WebPushException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.push_subscription import PushSubscription
from app.models.user import User, UserRole

logger = logging.getLogger("conceptstay.push")

DEFAULT_ICON = "/icons/icon-192x192.png"


def _send_single_webpush(
    endpoint: str,
    p256dh: str,
    auth: str,
    payload_str: str,
    vapid_private_key: str,
    vapid_claims: dict,
) -> int:
    """Synchronous push sender executed in worker thread."""
    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=payload_str,
            vapid_private_key=vapid_private_key,
            vapid_claims=vapid_claims,
        )
        return 200
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else 0
        logger.warning("WebPush failed for %s (status=%s): %s", endpoint[:50], status, exc)
        return status
    except Exception as exc:
        logger.error("Unexpected WebPush error for %s: %s", endpoint[:50], exc)
        return 500


async def _dispatch_to_subscriptions(
    subs: Sequence[PushSubscription],
    title: str,
    body: str,
    url: str,
    icon: str = DEFAULT_ICON,
    db: AsyncSession | None = None,
) -> int:
    """Internal helper to send webpush to a collection of subscriptions and prune dead ones."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured — skipping push notification")
        return 0

    if not subs:
        return 0

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "icon": icon,
        "badge": icon,
    })

    vapid_claims = {"sub": f"mailto:{settings.VAPID_CONTACT_EMAIL}"}
    dead_endpoints: list[str] = []
    success_count = 0

    for sub in subs:
        status = await asyncio.to_thread(
            _send_single_webpush,
            endpoint=sub.endpoint,
            p256dh=sub.p256dh,
            auth=sub.auth,
            payload_str=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=vapid_claims,
        )
        if status in (200, 201):
            success_count += 1
        elif status in (404, 410):
            # Subscription has expired or user revoked permission
            dead_endpoints.append(sub.endpoint)

    # Prune dead subscriptions from DB
    if dead_endpoints:
        cleanup_task = _prune_dead_endpoints(dead_endpoints, db)
        asyncio.create_task(cleanup_task)

    return success_count


async def _prune_dead_endpoints(endpoints: list[str], existing_db: AsyncSession | None = None) -> None:
    """Remove expired/invalid push endpoints from the database."""
    try:
        if existing_db is not None:
            for ep in endpoints:
                dead = await existing_db.scalar(select(PushSubscription).where(PushSubscription.endpoint == ep))
                if dead:
                    await existing_db.delete(dead)
            await existing_db.commit()
        else:
            async with async_session() as session:
                for ep in endpoints:
                    dead = await session.scalar(select(PushSubscription).where(PushSubscription.endpoint == ep))
                    if dead:
                        await session.delete(dead)
                await session.commit()
    except Exception as e:
        logger.error("Failed to prune dead push endpoints: %s", e)


async def send_push_to_admins(
    title: str,
    body: str,
    url: str = "/admin",
    icon: str = DEFAULT_ICON,
    db: AsyncSession | None = None,
) -> int:
    """Send push notification to all devices registered by Admin users."""
    try:
        if db is not None:
            query = (
                select(PushSubscription)
                .join(User, PushSubscription.user_id == User.id)
                .where(User.role == UserRole.admin)
            )
            subs = (await db.execute(query)).scalars().all()
            return await _dispatch_to_subscriptions(subs, title, body, url, icon, db=db)
        else:
            async with async_session() as session:
                query = (
                    select(PushSubscription)
                    .join(User, PushSubscription.user_id == User.id)
                    .where(User.role == UserRole.admin)
                )
                subs = (await session.execute(query)).scalars().all()
                return await _dispatch_to_subscriptions(subs, title, body, url, icon, db=session)
    except Exception as e:
        logger.error("Error sending push to admins: %s", e)
        return 0


async def send_push_to_user(
    user_id: uuid.UUID | str,
    title: str,
    body: str,
    url: str = "/dashboard",
    icon: str = DEFAULT_ICON,
    db: AsyncSession | None = None,
) -> int:
    """Send push notification to all devices registered by a specific user."""
    target_uuid = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    try:
        if db is not None:
            query = select(PushSubscription).where(PushSubscription.user_id == target_uuid)
            subs = (await db.execute(query)).scalars().all()
            return await _dispatch_to_subscriptions(subs, title, body, url, icon, db=db)
        else:
            async with async_session() as session:
                query = select(PushSubscription).where(PushSubscription.user_id == target_uuid)
                subs = (await session.execute(query)).scalars().all()
                return await _dispatch_to_subscriptions(subs, title, body, url, icon, db=session)
    except Exception as e:
        logger.error("Error sending push to user %s: %s", user_id, e)
        return 0


async def send_push_to_all(
    title: str,
    body: str,
    url: str = "/admin",
    icon: str = DEFAULT_ICON,
    db: AsyncSession | None = None,
) -> int:
    """Send a push notification to every stored subscription."""
    try:
        if db is not None:
            subs = (await db.execute(select(PushSubscription))).scalars().all()
            return await _dispatch_to_subscriptions(subs, title, body, url, icon, db=db)
        else:
            async with async_session() as session:
                subs = (await session.execute(select(PushSubscription))).scalars().all()
                return await _dispatch_to_subscriptions(subs, title, body, url, icon, db=session)
    except Exception as e:
        logger.error("Error sending push to all: %s", e)
        return 0
