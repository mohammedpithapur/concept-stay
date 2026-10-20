"""Remove EVERY listing and everything hanging off it (bookings, payments, payouts, reviews, images, ...).

The client's existing listings are dummy data. Users are kept. Dry run by default: it only prints counts.

    python scripts/purge_listings.py              # dry run, counts only
    python scripts/purge_listings.py --yes        # delete
    python scripts/purge_listings.py --yes --confirm-production   # required when ENVIRONMENT=production
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # run from anywhere

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.booking import Booking
from app.models.ical import ICalLink
from app.models.payment import Payment
from app.models.payout import Payout
from app.models.price_override import PropertyPriceOverride
from app.models.property import Property, PropertyImage
from app.models.property_group import PropertyGroup, PropertyGroupMember
from app.models.review import Review
from app.services.upload import delete_property_image_from_url

# Child tables first: a row may only be deleted once nothing references it.
_TABLES = [
    ("reviews", Review),
    ("payouts", Payout),
    ("payments", Payment),
    ("bookings", Booking),
    ("ical_links", ICalLink),
    ("price_overrides", PropertyPriceOverride),
    ("group_members", PropertyGroupMember),
    ("groups", PropertyGroup),
    ("images", PropertyImage),
    ("properties", Property),
]


def refuse_if_production(environment: str, confirm_production: bool) -> None:
    if environment.lower() in ("production", "prod") and not confirm_production:
        raise SystemExit("Refusing to run with ENVIRONMENT=production without --confirm-production.")


async def purge_all_listings(db: AsyncSession, *, dry_run: bool = True) -> dict[str, int]:
    """Return how many rows of each kind exist (dry run) or were deleted. Storage files are removed best-effort."""
    counts = {name: await db.scalar(select(func.count()).select_from(model)) or 0 for name, model in _TABLES}
    counts.pop("group_members")  # an implementation detail, not worth reporting separately
    counts = {k: counts[k] for k in ("properties", "bookings", "payments", "payouts", "reviews", "images",
                                      "ical_links", "price_overrides", "groups")}
    if dry_run:
        return counts

    image_urls = (await db.execute(select(PropertyImage.image_url))).scalars().all()
    for _, model in _TABLES:
        await db.execute(delete(model))
    await db.commit()

    for url in image_urls:  # after the commit: a storage hiccup must never undo the database purge
        try:
            await asyncio.to_thread(delete_property_image_from_url, url)
        except Exception:  # noqa: BLE001 - best effort
            pass
    return counts


async def _main(args: argparse.Namespace) -> None:
    from app.database import async_session

    refuse_if_production(settings.ENVIRONMENT, args.confirm_production)
    async with async_session() as db:
        counts = await purge_all_listings(db, dry_run=not args.yes)
    verb = "Deleted" if args.yes else "Would delete (dry run, pass --yes to do it)"
    print(f"{verb}:")
    for name, n in counts.items():
        print(f"  {name:16}{n}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="actually delete (default is a dry run)")
    parser.add_argument("--confirm-production", action="store_true")
    asyncio.run(_main(parser.parse_args()))
