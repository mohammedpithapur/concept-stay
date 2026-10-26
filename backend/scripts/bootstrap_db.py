"""Bring a database to the current schema.

The historical Alembic chain cannot build a database from nothing (older migrations assume tables
that were created with create_all), so: empty database -> create_all + stamp head; existing database
-> alembic upgrade head. Safe to run on every container start.
"""
import asyncio
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # run from anywhere

from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401  (registers every table on Base.metadata)
from app.database import Base, engine  # noqa: E402


def alembic(*args: str) -> None:
    subprocess.run([sys.executable, "-m", "alembic", *args], check=True)


async def main() -> None:
    async with engine.begin() as conn:
        existing = bool(await conn.scalar(text("select to_regclass('public.users') is not null")))
        stamped = bool(await conn.scalar(text("select to_regclass('public.alembic_version') is not null")))
        if not existing:
            await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    if existing and stamped:
        print("Existing database: alembic upgrade head")
        alembic("upgrade", "head")
    else:
        print("Empty or unstamped database: tables ensured, alembic stamp head")
        alembic("stamp", "head")


if __name__ == "__main__":
    asyncio.run(main())
