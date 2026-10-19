import os
import sys
from pathlib import Path
import pytest
from httpx import AsyncClient
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import Base, get_db
from app.main import app
from app.models.user import User, UserRole
from app.config import settings

# Override external API keys for testing to prevent real network calls
settings.RESEND_API_KEY = None
settings.FAST2SMS_API_KEY = None

from app.rate_limit import limiter
limiter.enabled = False  # tests register/login many times; rate limits would cause 429s



TEST_DB_ENV = "TEST_DATABASE_URL"
TEST_SCHEMA = "test_schema"


def _get_test_db_url() -> str:
    test_db_url = os.getenv(TEST_DB_ENV)
    if not test_db_url:
        raise RuntimeError(
            f"{TEST_DB_ENV} is not set. Configure a dedicated test database URL."
        )
    return test_db_url


# Bootstrap engine: no search_path override — used only to CREATE/DROP the schema itself.
# Must exist before test_engine tries to use it.
_bootstrap_engine = create_async_engine(
    _get_test_db_url(),
    connect_args={"statement_cache_size": 0},
    echo=False,
    poolclass=NullPool,
)

# Test engine: all queries land in test_schema.
# NullPool avoids asyncpg "another operation is in progress" errors.
test_engine = create_async_engine(
    _get_test_db_url(),
    connect_args={
        "statement_cache_size": 0,
        "server_settings": {"search_path": TEST_SCHEMA},
    },
    execution_options={"schema_translate_map": {None: TEST_SCHEMA}},
    echo=False,
    poolclass=NullPool,
)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
async def _create_test_schema():
    # Step 1: ensure the schema exists (using bootstrap engine so search_path
    # doesn't need to resolve yet).
    async with _bootstrap_engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {TEST_SCHEMA}"))

    # Step 2: create all tables and ENUM types inside test_schema.
    async with test_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn.execution_options(schema_translate_map={None: TEST_SCHEMA})
            )
        )

    yield

    # Teardown: drop the entire schema (tables + ENUM types) in one shot.
    async with _bootstrap_engine.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))


@pytest.fixture(autouse=True)
async def _truncate_tables(_create_test_schema):
    """Truncate all tables before each test for full isolation."""
    async with test_engine.begin() as conn:
        table_names = [f'{TEST_SCHEMA}."{table.name}"' for table in Base.metadata.sorted_tables]
        if table_names:
            await conn.execute(text(f"TRUNCATE {', '.join(table_names)} CASCADE"))
    yield


@pytest.fixture
async def client():
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def admin_token(client):
    admin_email = "admin@example.com"
    admin_password = "AdminPass123!"

    await client.post(
        "/auth/register",
        json={"email": admin_email, "password": admin_password, "full_name": "Admin User"},
    )

    async with TestSessionLocal() as session:
        await session.execute(
            update(User).where(User.email == admin_email).values(role=UserRole.admin)
        )
        await session.commit()

    login = await client.post(
        "/auth/login",
        json={"identifier": admin_email, "password": admin_password},
    )
    token = login.json()["access_token"]
    return token


@pytest.fixture
async def user_token(client):
    user_email = "guest@example.com"
    user_password = "GuestPass123!"

    await client.post(
        "/auth/register",
        json={"email": user_email, "password": user_password, "full_name": "Guest User"},
    )

    login = await client.post(
        "/auth/login",
        json={"identifier": user_email, "password": user_password},
    )
    token = login.json()["access_token"]
    return token


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}
