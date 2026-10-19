import uuid
import json
from datetime import datetime

from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base, utc_now


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (
        Index("ix_properties_is_published", "is_published"),
        Index("ix_properties_owner_id", "owner_id"),
        Index("ix_properties_is_published_city", "is_published", "city"),
        Index("ix_properties_property_type", "property_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    city: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(100), default="India", nullable=False)
    latitude: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    contact_whatsapp: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    contact_spare_phone: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    booking_email_instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    check_in_time: Mapped[str] = mapped_column(String(20), default="2:00 PM", nullable=False)
    check_out_time: Mapped[str] = mapped_column(String(20), default="11:00 AM", nullable=False)
    house_rules: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)
    local_recommendations: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)
    price_per_night: Mapped[int] = mapped_column(Integer, nullable=False)
    cleaning_fee: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    extra_guest_charge_per_night: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    base_guests: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_guests: Mapped[int] = mapped_column(Integer, nullable=False)
    bedrooms: Mapped[int] = mapped_column(Integer, nullable=False)
    bathrooms: Mapped[int] = mapped_column(Integer, nullable=False)
    bathrooms_detail: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)
    min_nights: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    pets_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pet_charge_per_night: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_pets: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amenities: Mapped[dict] = mapped_column(JSONB, default=list, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    override_house_rules: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    override_amenities: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    override_details: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    property_type: Mapped[str] = mapped_column(String(30), default="villa", server_default="villa", nullable=False)
    categories: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    experience_tags: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    number_of_rooms: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    about_stay: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    the_space: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    location_notes: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    what_guests_love: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    things_to_know: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    cancellation_policy: Mapped[str] = mapped_column(String(20), default="flexible", server_default="flexible", nullable=False)
    approval_status: Mapped[str] = mapped_column(String(20), default="approved", server_default="approved", nullable=False)
    pending_changes: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", server_default="unverified", nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    avg_rating: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    @property
    def spaces_detail(self) -> list[dict]:
        spaces = []
        raw = getattr(self, "amenities", [])
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = []
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, str):
                    if item.startswith("__space__:"):
                        try:
                            spaces.append(json.loads(item[10:]))
                        except Exception:
                            pass
                    elif item.strip().startswith("{") and ("type" in item or "count" in item):
                        try:
                            parsed = json.loads(item)
                            if isinstance(parsed, dict) and "type" in parsed:
                                spaces.append(parsed)
                        except Exception:
                            pass
                elif isinstance(item, dict) and "type" in item:
                    spaces.append(item)
        return spaces

    @spaces_detail.setter
    def spaces_detail(self, value):
        current = list(self.amenities) if hasattr(self, "amenities") and isinstance(self.amenities, list) else []
        if isinstance(current, str):
            try:
                current = json.loads(current)
            except Exception:
                current = []
        if not isinstance(current, list):
            current = []
        clean = [
            item for item in current
            if not (isinstance(item, str) and (item.startswith("__space__:") or item.strip().startswith("{")))
            and not isinstance(item, dict)
        ]
        if value and isinstance(value, list):
            for sp in value:
                if isinstance(sp, dict):
                    clean.append(f"__space__:{json.dumps(sp)}")
        self.amenities = clean

    images: Mapped[list["PropertyImage"]] = relationship(
        "PropertyImage",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="PropertyImage.display_order",
    )
    group_memberships: Mapped[list["PropertyGroupMember"]] = relationship(
        "PropertyGroupMember",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    price_overrides: Mapped[list["PropertyPriceOverride"]] = relationship(
        "PropertyPriceOverride",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="PropertyPriceOverride.start_date",
    )
    owner: Mapped["User"] = relationship("User")


class PropertyImage(Base):
    __tablename__ = "property_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    album_name: Mapped[str] = mapped_column(String(100), default="General", nullable=False)

    property: Mapped["Property"] = relationship("Property", back_populates="images")
