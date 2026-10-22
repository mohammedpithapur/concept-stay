import sys
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.booking import Booking
from app.models.payout import Payout
from app.models.property import Property
from app.models.user import User
from tests.test_payouts import _book, _listing, _pay, _razorpay_secret  # noqa: F401  (autouse fixture)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import purge_listings  # noqa: E402

pytestmark = pytest.mark.asyncio


async def _count(db, model) -> int:
    return await db.scalar(select(func.count()).select_from(model))


async def _seed(client, admin_headers, user_token, db_session):
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid)
    assert (await _pay(client, db_session, user_token, booking)).status_code == 200


async def test_dry_run_counts_and_deletes_nothing(client, admin_headers, user_token, db_session):
    await _seed(client, admin_headers, user_token, db_session)
    counts = await purge_listings.purge_all_listings(db_session)
    assert counts["properties"] == 1 and counts["bookings"] == 1 and counts["payouts"] == 1 and counts["payments"] == 1
    assert await _count(db_session, Property) == 1 and await _count(db_session, Booking) == 1


async def test_real_run_removes_listings_but_keeps_users(client, admin_headers, user_token, db_session):
    await _seed(client, admin_headers, user_token, db_session)
    users_before = await _count(db_session, User)
    counts = await purge_listings.purge_all_listings(db_session, dry_run=False)
    assert counts["properties"] == 1
    for model in (Property, Booking, Payout):
        assert await _count(db_session, model) == 0
    assert await _count(db_session, User) == users_before


def test_refuses_production_without_extra_flag():
    with pytest.raises(SystemExit):
        purge_listings.refuse_if_production("production", False)
    purge_listings.refuse_if_production("production", True)
    purge_listings.refuse_if_production("development", False)


async def test_purge_also_removes_guest_id_files(client, admin_headers, user_token, db_session, monkeypatch):
    from app.models.guest_id import GuestIdDocument
    from app.services import private_storage

    deleted: list[str] = []

    async def fake_delete(path):
        deleted.append(path)

    monkeypatch.setattr(private_storage, "delete_private", fake_delete)
    pid = await _listing(client, admin_headers)
    booking = await _book(client, user_token, pid)
    assert (await _pay(client, db_session, user_token, booking)).status_code == 200
    db_session.add(GuestIdDocument(
        booking_id=booking["id"], guest_id=booking["guest_id"], doc_type="passport",
        storage_path="guest-ids/b/file.png", filename="id.png", mime="image/png",
    ))
    await db_session.commit()

    counts = await purge_listings.purge_all_listings(db_session, dry_run=False)
    assert counts["guest_ids"] == 1
    assert deleted == ["guest-ids/b/file.png"]
    assert await _count(db_session, GuestIdDocument) == 0
