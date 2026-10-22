"""Demo data for a STAGING database only. Idempotent. Never run against production.

Creates an admin, an approved host, an approved operator, and a handful of verified, approved listings and
experiences so a reviewer can browse, filter, map, book and cancel immediately. Logins are printed at the end.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # run from anywhere

from sqlalchemy import select

from app.database import async_session
from app.models.experience import Experience, ExperienceSlot
from app.models.fx_rate import FxRate
from app.models.host_profile import HostProfile
from app.models.property import Property, PropertyImage
from app.models.user import HostStatus, User, UserRole
from app.services.auth import hash_password
from app.services.crypto import encrypt_text
from app.database import utc_now

PASSWORD = os.environ.get("STAGING_SEED_PASSWORD", "Staging#2026")
ACCOUNTS = [
    ("admin@staging.test", "Staging Admin", UserRole.admin),
    ("host@staging.test", "Staging Host", UserRole.host),
    ("operator@staging.test", "Staging Operator", UserRole.operator),
    ("guest@staging.test", "Staging Guest", UserRole.guest),
]
# Demo exchange rates (units per rupee) so the currency selector works on staging. Real rates are set by an admin.
FX_RATES = {"USD": "0.012", "EUR": "0.011", "GBP": "0.0095", "AED": "0.044", "SGD": "0.016", "AUD": "0.018"}
IMG = "https://images.unsplash.com/{}?auto=format&fit=crop&w=1200&q=70"
LISTINGS = [
    ("Pine Ridge Cottage", "Manali", "Himachal Pradesh", 32.2396, 77.1887, 4200, "cottage", ["mountain", "nature"], ["romantic", "nature"], "moderate", "photo-1470770841072-f978cf4d019e"),
    ("Lakeview Boutique Stay", "Udaipur", "Rajasthan", 24.5854, 73.6830, 7800, "boutique_stay", ["lakeside", "boutique"], ["romantic", "wellness"], "flexible", "photo-1566073771259-6a8506099945"),
    ("Orchard Farm Homestay", "Coorg", "Karnataka", 12.4244, 75.7382, 3100, "farm_stay", ["farm", "homestay", "budget"], ["family", "nature"], "flexible", "photo-1500382017468-9049fed747ef"),
    ("Offbeat Valley Villa", "Spiti", "Himachal Pradesh", 32.2460, 78.0350, 12500, "villa", ["offbeat", "mountain"], ["adventure", "remote_offgrid"], "non_refundable", "photo-1506905925346-21bda4d32df4"),
    ("Backwater Workation Loft", "Alleppey", "Kerala", 9.4981, 76.3388, 5600, "guesthouse", ["lakeside", "nature"], ["workation", "solo"], "moderate", "photo-1602002418082-a4443e081dd1"),
]
# title, city, state, category, minutes, difficulty, min age, price per person, photo, meeting point
EXPERIENCES = [
    ("Sunrise Ridge Trek", "Manali", "Himachal Pradesh", "adventure", 240, "moderate", 12, 1800, "photo-1551632811-561732d1e306",
     "Mall Road taxi stand, 5:30 AM"),
    ("Old Town Food Walk", "Udaipur", "Rajasthan", "food", 150, "easy", 6, 1200, "photo-1555939594-58d7cb561ad1",
     "Clock Tower gate"),
]
SLOT_DAYS = (3, 6, 10)  # each experience gets three open dates, nine in the morning India time
SLOT_CAPACITY = 6


async def main() -> None:
    async with async_session() as db:
        users = {}
        for email, name, role in ACCOUNTS:
            user = await db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(email=email, full_name=name, role=role, host_status=HostStatus.approved,
                            password_hash=hash_password(PASSWORD), is_email_verified=True)
                db.add(user)
            users[role] = user
        await db.flush()

        # The demo host is already KYC-verified so the admin can mark payouts paid straight away.
        host = users[UserRole.host]
        if not await db.get(HostProfile, host.id):
            db.add(HostProfile(
                user_id=host.id, legal_name="Staging Host", phone="+91 90000 00000", pan_enc=encrypt_text("ABCDE1234F"),
                aadhaar_last4="4321", bank_holder="Staging Host", bank_account_enc=encrypt_text("123456789012"),
                bank_ifsc="HDFC0001234", kyc_status="verified", verified_at=utc_now(),
            ))
        # The demo operator is KYC-verified too, so the admin can mark experience payouts paid straight away.
        operator = users[UserRole.operator]
        if not await db.get(HostProfile, operator.id):
            db.add(HostProfile(
                user_id=operator.id, legal_name="Staging Operator", phone="+91 90000 00001", pan_enc=encrypt_text("FGHIJ5678K"),
                aadhaar_last4="8765", bank_holder="Staging Operator", bank_account_enc=encrypt_text("210987654321"),
                bank_ifsc="HDFC0004321", kyc_status="verified", verified_at=utc_now(),
            ))
        for currency, rate in FX_RATES.items():
            if not await db.get(FxRate, currency):
                db.add(FxRate(currency=currency, rate_per_inr=rate))

        for name, city, state, lat, lng, price, ptype, cats, tags, policy, photo in LISTINGS:
            if await db.scalar(select(Property).where(Property.name == name)):
                continue
            prop = Property(
                owner_id=users[UserRole.host].id, name=name, city=city, state=state, country="India",
                latitude=lat, longitude=lng, address=f"{name}, {city}", description=f"{name} in {city}: a quiet, well-kept stay.",
                about_stay=f"A hand-picked {ptype.replace('_', ' ')} in {city}.", the_space="Two bedrooms, a living room and a private sit-out.",
                location_notes="Short drive from the main market.", what_guests_love="Quiet surroundings and attentive hosts.",
                things_to_know="Quiet hours after 10 PM.", contact_phone="+91 90000 00000", contact_email="host@staging.test",
                price_per_night=price, cleaning_fee=500, base_guests=2, max_guests=4, bedrooms=2, bathrooms=2,
                bathrooms_detail=[{"type": "ensuite", "count": 2}], amenities=["WiFi", "Parking", "Kitchen"],
                house_rules=["No smoking indoors"], property_type=ptype, categories=cats, experience_tags=tags,
                cancellation_policy=policy, is_published=True, is_featured=True, approval_status="approved",
                verification_status="verified",
            )
            db.add(prop)
            await db.flush()
            db.add(PropertyImage(property_id=prop.id, image_url=IMG.format(photo), is_primary=True, display_order=0))
        today = datetime.now(timezone.utc).replace(hour=3, minute=30, second=0, microsecond=0)  # 09:00 India time
        for title, city, state, category, minutes, difficulty, min_age, price, photo, meeting in EXPERIENCES:
            if await db.scalar(select(Experience).where(Experience.title == title)):
                continue
            exp = Experience(
                operator_id=operator.id, title=title, description=f"{title} in {city}, led by a trusted local guide.",
                images=[IMG.format(photo)], city=city, state=state, meeting_point=meeting, category=category,
                duration_minutes=minutes, difficulty=difficulty, min_age=min_age, languages=["English", "Hindi"],
                included="Guide and refreshments", what_to_bring="Comfortable shoes and water",
                price_per_person=price, approval_status="approved", is_published=True,
            )
            db.add(exp)
            await db.flush()
            for days in SLOT_DAYS:
                db.add(ExperienceSlot(
                    experience_id=exp.id, starts_at=today + timedelta(days=days), capacity=SLOT_CAPACITY, seats_booked=0,
                ))
        await db.commit()
    print("Staging data ready. Logins (password for all):", PASSWORD)
    for email, _, role in ACCOUNTS:
        print(f"  {role.value:6} {email}")


if __name__ == "__main__":
    if os.environ.get("ENVIRONMENT", "").lower() == "production" and os.environ.get("ALLOW_SEED") != "1":
        sys.exit("Refusing to seed with ENVIRONMENT=production (set ALLOW_SEED=1 only on a staging database).")
    asyncio.run(main())
