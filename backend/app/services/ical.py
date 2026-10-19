import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import utc_now
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.ical import ICalDirection, ICalLink
from app.models.property import Property
from app.models.user import User
from app.services.booking import apply_group_blocking, remove_shadow_blocks

logger = logging.getLogger("conceptstay.ical")


def _parse_ics_date(val: str) -> date | None:
    """Parse various iCal date formats: DTSTART;VALUE=DATE:20260818, 20260818T140000Z, 2026-08-18, etc."""
    if not val:
        return None
    # The actual date/time string is always after the last colon in an iCal line
    raw_val = val.strip().split(":")[-1].strip()
    # Match YYYYMMDD or YYYYMMDDTHHMMSSZ
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", raw_val)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    # Match YYYY-MM-DD
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw_val)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


def parse_ical_events(ics_text: str) -> list[dict[str, Any]]:
    """
    Parse VEVENT blocks from an RFC 5545 iCalendar string.
    Returns list of dicts with {uid, summary, check_in, check_out}.
    """
    # Unfold lines (RFC 5545: CRLF + space/tab is continuation)
    unfolded = re.sub(r"\r?\n[ \t]", "", ics_text)
    events: list[dict[str, Any]] = []

    # Split into VEVENT blocks
    vevent_blocks = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", unfolded, re.DOTALL | re.IGNORECASE)

    for block in vevent_blocks:
        dtstart_raw = None
        dtend_raw = None
        summary = "External Reservation"
        uid = str(uuid.uuid4())

        for line in block.strip().splitlines():
            line = line.strip()
            if not line:
                continue

            if re.match(r"^DTSTART", line, re.IGNORECASE):
                dtstart_raw = line
            elif re.match(r"^DTEND", line, re.IGNORECASE):
                dtend_raw = line
            elif re.match(r"^SUMMARY", line, re.IGNORECASE):
                summary = line.split(":", 1)[-1].strip() or "External Reservation"
            elif re.match(r"^UID", line, re.IGNORECASE):
                uid = line.split(":", 1)[-1].strip()

        if dtstart_raw:
            check_in = _parse_ics_date(dtstart_raw)
            check_out = _parse_ics_date(dtend_raw) if dtend_raw else None

            # If no check_out or check_out <= check_in, default to 1 night
            if check_in:
                if not check_out or check_out <= check_in:
                    check_out = check_in + timedelta(days=1)

                events.append({
                    "uid": uid,
                    "summary": summary,
                    "check_in": check_in,
                    "check_out": check_out,
                })

    return events


async def sync_single_ical_link(
    db: AsyncSession,
    link: ICalLink,
    admin_user: User,
) -> int:
    """
    Fetch and sync a single iCal import link.
    Creates or updates admin date blocks in Concept Stay.
    Returns the count of imported events.
    """
    if link.direction != ICalDirection.import_:
        return 0

    url = link.ical_url.strip()
    if not url:
        return 0

    # Ensure http/https scheme (some platforms use webcal://)
    if url.startswith("webcal://"):
        url = "https://" + url[9:]
    elif url.startswith("http://"):
        # Upgrade if possible, but keep as fallback
        pass
    elif not url.startswith("https://"):
        url = "https://" + url

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ConceptStayCalendarSync/1.0; +https://conceptstay.in)"
    }

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, verify=False) as client:
            res = await client.get(url, headers=headers)
            if not res.is_success:
                logger.error("Failed to fetch iCal URL %s: HTTP %s", url, res.status_code)
                return 0
            ics_text = res.text
    except Exception as exc:
        logger.exception("Error downloading iCal feed from %s: %s", url, exc)
        return 0

    parsed_events = parse_ical_events(ics_text)
    if not parsed_events:
        link.last_synced = utc_now()
        await db.commit()
        return 0

    tag_prefix = f"iCal: {link.calendar_name}"

    # 1. Remove existing iCal blocks created by this link (and their shadow blocks)
    old_blocks_result = await db.execute(
        select(Booking).where(
            Booking.property_id == link.property_id,
            Booking.is_admin_block == True,
            Booking.note.like(f"{tag_prefix}%"),
        )
    )
    old_blocks = old_blocks_result.scalars().all()
    for old_b in old_blocks:
        await remove_shadow_blocks(db, old_b, commit=False)
        await db.delete(old_b)

    # 2. Insert new blocks
    imported_count = 0
    today = date.today()

    for ev in parsed_events:
        # Skip past events
        if ev["check_out"] <= today:
            continue

        nights = (ev["check_out"] - ev["check_in"]).days

        block = Booking(
            property_id=link.property_id,
            guest_id=admin_user.id,
            check_in=ev["check_in"],
            check_out=ev["check_out"],
            guests=1,
            pets=0,
            nights=max(1, nights),
            base_price=0,
            cleaning_fee=0,
            pet_charge=0,
            total=0,
            status=BookingStatus.confirmed,
            payment_status=PaymentStatus.paid,
            is_admin_block=True,
            is_shadow_block=False,
            note=f"{tag_prefix} ({ev['summary']})",
            guest_name=f"iCal Block ({link.calendar_name})",
            guest_email="ical-sync@conceptstay.in",
            guest_phone="",
        )
        db.add(block)
        await db.flush()
        await apply_group_blocking(db, block, commit=False)
        imported_count += 1

    link.last_synced = utc_now()
    await db.commit()
    logger.info("iCal sync completed for property %s: imported %d events", link.property_id, imported_count)
    return imported_count


async def sync_property_ical_links(
    db: AsyncSession,
    property_id: uuid.UUID,
    admin_user: User,
) -> dict[str, int]:
    """Sync all import links configured for a property."""
    links_res = await db.execute(
        select(ICalLink).where(
            ICalLink.property_id == property_id,
            ICalLink.direction == ICalDirection.import_,
        )
    )
    links = links_res.scalars().all()
    results = {}
    for l in links:
        count = await sync_single_ical_link(db, l, admin_user)
        results[str(l.id)] = count
    return results


async def sync_all_active_ical_links() -> int:
    """Periodic background task: sync all active import iCal links across all properties."""
    from app.database import async_session
    from app.models.user import UserRole

    async with async_session() as db:
        admin_res = await db.execute(
            select(User).where(User.role == UserRole.admin).limit(1)
        )
        admin = admin_res.scalar_one_or_none()
        if not admin:
            logger.warning("No admin user found for background iCal sync")
            return 0

        links_res = await db.execute(
            select(ICalLink).where(ICalLink.direction == ICalDirection.import_)
        )
        links = links_res.scalars().all()
        if not links:
            return 0

        total_imported = 0
        for link in links:
            try:
                count = await sync_single_ical_link(db, link, admin)
                total_imported += count
            except Exception as e:
                logger.exception("Error syncing iCal link %s (%s): %s", link.id, link.calendar_name, e)

        return total_imported

