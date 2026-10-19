import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.config import settings


logger = logging.getLogger("conceptstay.cache")
_redis: Redis | None = None


def get_redis() -> Redis | None:
    global _redis
    if not settings.REDIS_URL:
        return None
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def cache_get_json(key: str) -> Any | None:
    client = get_redis()
    if client is None:
        return None
    try:
        value = await client.get(key)
    except Exception:
        logger.exception("Redis get failed")
        return None
    return json.loads(value) if value else None


async def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    client = get_redis()
    if client is None:
        return
    try:
        await client.setex(key, ttl_seconds, json.dumps(value))
    except Exception:
        logger.exception("Redis set failed")


async def invalidate_properties_cache() -> None:
    client = get_redis()
    if client is None:
        return
    try:
        keys = await client.keys("properties:*")
        if keys:
            await client.delete(*keys)
    except Exception:
        logger.exception("Redis invalidation failed")
