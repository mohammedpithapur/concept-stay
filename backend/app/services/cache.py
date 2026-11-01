import json
import logging
import time
from collections import OrderedDict
from typing import Any

from redis.asyncio import Redis

from app.config import settings


logger = logging.getLogger("conceptstay.cache")
_redis: Redis | None = None

# Fallback for a single server without Redis (MEMORY_CACHE=1). Not shared between processes, so it is only for one worker.
MEMORY_MAX_ENTRIES = 500
_memory: "OrderedDict[str, tuple[float, str]]" = OrderedDict()


def _memory_on() -> bool:
    return bool(settings.MEMORY_CACHE) and not settings.REDIS_URL


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
        if not _memory_on():
            return None
        entry = _memory.get(key)
        if entry is None:
            return None
        if entry[0] <= time.monotonic():
            _memory.pop(key, None)
            return None
        return json.loads(entry[1])
    try:
        value = await client.get(key)
    except Exception:
        logger.exception("Redis get failed")
        return None
    return json.loads(value) if value else None


async def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    client = get_redis()
    if client is None:
        if _memory_on():
            _memory[key] = (time.monotonic() + ttl_seconds, json.dumps(value))
            _memory.move_to_end(key)
            while len(_memory) > MEMORY_MAX_ENTRIES:
                _memory.popitem(last=False)
        return
    try:
        await client.setex(key, ttl_seconds, json.dumps(value))
    except Exception:
        logger.exception("Redis set failed")


async def invalidate_properties_cache() -> None:
    client = get_redis()
    if client is None:
        for key in [k for k in _memory if k.startswith("properties:")]:
            _memory.pop(key, None)
        return
    try:
        keys = await client.keys("properties:*")
        if keys:
            await client.delete(*keys)
    except Exception:
        logger.exception("Redis invalidation failed")


async def cache_delete(key: str) -> None:
    client = get_redis()
    if client is None:
        _memory.pop(key, None)
        return
    try:
        await client.delete(key)
    except Exception:
        logger.exception("Redis delete failed")
