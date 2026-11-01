"""Without Redis, a single-server deployment can still cache public lists in process memory (MEMORY_CACHE=1)."""
import pytest

from app.config import settings
from app.services import cache

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", None)
    cache._memory.clear()


async def test_off_by_default_nothing_is_cached(monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_CACHE", False)
    await cache.cache_set_json("properties:list:a", {"items": [1]}, ttl_seconds=60)
    assert await cache.cache_get_json("properties:list:a") is None


async def test_set_then_get_returns_a_copy_that_expires(monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_CACHE", True)
    now = [1000.0]
    monkeypatch.setattr(cache.time, "monotonic", lambda: now[0])
    value = {"items": [1, 2]}
    await cache.cache_set_json("properties:list:a", value, ttl_seconds=60)
    got = await cache.cache_get_json("properties:list:a")
    assert got == value and got is not value  # callers may mutate what they get
    now[0] += 61
    assert await cache.cache_get_json("properties:list:a") is None


async def test_invalidate_clears_property_keys_only(monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_CACHE", True)
    await cache.cache_set_json("properties:list:a", {"x": 1}, ttl_seconds=60)
    await cache.cache_set_json("articles:list", {"y": 2}, ttl_seconds=60)
    await cache.invalidate_properties_cache()
    assert await cache.cache_get_json("properties:list:a") is None
    assert await cache.cache_get_json("articles:list") == {"y": 2}
    await cache.cache_delete("articles:list")
    assert await cache.cache_get_json("articles:list") is None


async def test_memory_cache_is_bounded(monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_CACHE", True)
    for i in range(cache.MEMORY_MAX_ENTRIES + 50):
        await cache.cache_set_json(f"properties:list:{i}", {"i": i}, ttl_seconds=60)
    assert len(cache._memory) <= cache.MEMORY_MAX_ENTRIES
    assert await cache.cache_get_json(f"properties:list:{cache.MEMORY_MAX_ENTRIES + 49}") == {"i": cache.MEMORY_MAX_ENTRIES + 49}
