import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool

from app.config import settings


IST = timezone(timedelta(hours=5, minutes=30))  # India has no DST


def today_ist() -> date:
    """Calendar date in India: check-in/out dates are local dates, so day-based rules must not use the server's clock."""
    return datetime.now(IST).date()


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# On AWS Lambda the execution environment is frozen between invocations.
# Using NullPool means each request gets a fresh connection that is closed
# immediately after use — no stale connections, no pool exhaustion.
# On a traditional server (local dev / Docker) we use AsyncAdaptedQueuePool for performance.
_IS_LAMBDA = os.environ.get("AWS_LAMBDA_FUNCTION_NAME") is not None

db_url = settings.DATABASE_URL.strip('"').strip("'")
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    db_url,
    poolclass=NullPool if _IS_LAMBDA else AsyncAdaptedQueuePool,
    connect_args={
        "statement_cache_size": 0,
        "server_settings": {"search_path": "public"},
    },
    echo=False,
    **({} if _IS_LAMBDA else {
        "pool_size": 15,
        "max_overflow": 25,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": False,
    })
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
