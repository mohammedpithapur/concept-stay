"""The public experience list is cached in process memory (MEMORY_CACHE=1) and cleared on any change.

Uses a stub session so it needs no database: it counts how often the list hits the DB."""
import pytest

from app.config import settings
from app.routers.experiences import list_experiences
from app.services import cache

pytestmark = pytest.mark.asyncio


class _Rows:
    def scalars(self):
        return self

    def all(self):
        return []


class CountingDb:
    def __init__(self):
        self.calls = 0

    async def scalar(self, *_):
        self.calls += 1
        return 0

    async def execute(self, *_):
        self.calls += 1
        return _Rows()


async def _list(db, **kw):
    params = dict(city=None, state=None, category=None, date_=None, max_price=None,
                  sort="newest", limit=20, offset=0, db=db)
    params.update(kw)
    return await list_experiences(**params)


@pytest.fixture(scope="session", autouse=True)
def _create_test_schema():
    """Override the conftest one: this module never opens a database."""


@pytest.fixture(autouse=True)
def _truncate_tables(_create_test_schema):
    """Override the conftest one: nothing to truncate."""


@pytest.fixture(autouse=True)
def _memory_cache(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", None)
    monkeypatch.setattr(settings, "MEMORY_CACHE", True)
    cache._memory.clear()
    yield
    cache._memory.clear()


async def test_second_identical_list_does_not_touch_the_db():
    db = CountingDb()
    first = await _list(db)
    used = db.calls
    assert used > 0
    second = await _list(db)
    assert db.calls == used
    assert (first.model_dump(mode="json") if hasattr(first, "model_dump") else first) == (
        second.model_dump(mode="json") if hasattr(second, "model_dump") else second
    )


async def test_different_filters_are_cached_separately():
    db = CountingDb()
    await _list(db, city="Goa")
    used = db.calls
    await _list(db, city="Manali")
    assert db.calls > used


async def test_any_properties_invalidation_clears_it():
    db = CountingDb()
    await _list(db)
    used = db.calls
    await cache.invalidate_properties_cache()
    await _list(db)
    assert db.calls > used


async def test_cache_off_means_every_list_hits_the_db(monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_CACHE", False)
    db = CountingDb()
    await _list(db)
    used = db.calls
    await _list(db)
    assert db.calls == 2 * used
