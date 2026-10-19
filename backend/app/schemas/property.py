import json
from typing import Any
from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from datetime import datetime

from app.taxonomy import CancellationPolicy, Category, ExperienceTag, PropertyType, VerificationStatus


# ── PropertyImage ──

class PropertyImageOut(BaseModel):
    id: Any
    image_url: str = ""
    is_primary: bool = False
    display_order: int = 0
    album_name: str = "General"

    @field_validator("id", mode="before")
    @classmethod
    def ensure_str_id(cls, v: Any) -> str:
        return str(v) if v is not None else ""

    model_config = {"from_attributes": True}


class PropertyImageCreate(BaseModel):
    image_url: str
    is_primary: bool = False
    display_order: int = 0
    album_name: str = "General"


class PropertyImageUpdate(BaseModel):
    is_primary: bool | None = None
    display_order: int | None = None
    album_name: str | None = None


# ── Property ──

class PropertyOut(BaseModel):
    id: Any
    owner_id: Any
    name: str = ""
    description: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    country: str = "India"
    latitude: float = 0.0
    longitude: float = 0.0
    contact_phone: str = ""
    contact_email: str = ""
    contact_whatsapp: str = ""
    contact_spare_phone: str = ""
    booking_email_instructions: str = ""
    check_in_time: str = "2:00 PM"
    check_out_time: str = "11:00 AM"
    house_rules: list[str] = Field(default_factory=list)
    local_recommendations: list[str] = Field(default_factory=list)
    price_per_night: int = 0
    cleaning_fee: int = 0
    extra_guest_charge_per_night: int = 0
    base_guests: int = 2
    max_guests: int = 30
    bedrooms: int = 1
    bathrooms: int = 1
    bathrooms_detail: list[dict] = Field(default_factory=list)
    spaces_detail: list[dict] = Field(default_factory=list)
    min_nights: int = 1
    pets_allowed: bool = False
    max_pets: int = 0
    pet_charge_per_night: int = 0
    amenities: list[str] = Field(default_factory=list)
    is_published: bool = True
    is_featured: bool = False
    override_house_rules: bool = False
    override_amenities: bool = False
    override_details: bool = False
    property_type: str = "villa"
    categories: list[str] = Field(default_factory=list)
    experience_tags: list[str] = Field(default_factory=list)
    number_of_rooms: int = 1
    about_stay: str = ""
    the_space: str = ""
    location_notes: str = ""
    what_guests_love: str = ""
    things_to_know: str = ""
    cancellation_policy: str = "flexible"
    approval_status: str = "approved"
    verification_status: str = "unverified"
    verified_at: Any = None
    avg_rating: float = 0.0
    review_count: int = 0
    created_at: Any = None
    updated_at: Any = None
    images: list[PropertyImageOut] = Field(default_factory=list)

    @field_validator("id", "owner_id", mode="before")
    @classmethod
    def ensure_str_uuid(cls, v: Any) -> str:
        return str(v) if v is not None else ""

    @field_validator(
        "price_per_night", "cleaning_fee", "extra_guest_charge_per_night",
        "base_guests", "max_guests", "bedrooms", "bathrooms",
        "min_nights", "max_pets", "pet_charge_per_night", "review_count", "number_of_rooms",
        mode="before"
    )
    @classmethod
    def ensure_int(cls, v: Any) -> int:
        if v is None:
            return 0
        try:
            return int(v)
        except Exception:
            return 0

    @field_validator("latitude", "longitude", "avg_rating", mode="before")
    @classmethod
    def ensure_float(cls, v: Any) -> float:
        if v is None:
            return 0.0
        try:
            return float(v)
        except Exception:
            return 0.0

    @field_validator(
        "name", "description", "address", "city", "state", "country",
        "contact_phone", "contact_email", "contact_whatsapp", "contact_spare_phone",
        "booking_email_instructions", "check_in_time", "check_out_time",
        mode="before"
    )
    @classmethod
    def ensure_string(cls, v: Any) -> str:
        return str(v) if v is not None else ""

    @field_validator("spaces_detail", "bathrooms_detail", mode="before")
    @classmethod
    def ensure_list(cls, v: Any) -> list[dict]:
        if v is None:
            return []
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []
            except Exception:
                return []
        if isinstance(v, list):
            return [item for item in v if isinstance(item, dict)]
        return []

    @field_validator("amenities", "house_rules", "local_recommendations", "categories", "experience_tags", mode="before")
    @classmethod
    def ensure_str_list(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(x) for x in parsed if not (isinstance(x, str) and (x.startswith("__space__:") or x.startswith("{")))]
            except Exception:
                pass
            return []
        if isinstance(v, list):
            return [str(x) for x in v if not (isinstance(x, str) and (x.startswith("__space__:") or x.startswith("{")))]
        return []

    model_config = {"from_attributes": True}


class PropertyCreate(BaseModel):
    name: str
    description: str
    address: str
    city: str
    state: str
    country: str = "India"
    latitude: float
    longitude: float
    contact_phone: str
    contact_email: str
    contact_whatsapp: str = ""
    contact_spare_phone: str = ""
    booking_email_instructions: str = ""
    check_in_time: str = "2:00 PM"
    check_out_time: str = "11:00 AM"
    house_rules: list[str] = []
    local_recommendations: list[str] = []
    price_per_night: int
    cleaning_fee: int = 0
    extra_guest_charge_per_night: int = 0
    base_guests: int = 2
    max_guests: int
    bedrooms: int
    bathrooms: int
    bathrooms_detail: list[dict] = []
    spaces_detail: list[dict] = []
    min_nights: int = 1
    pets_allowed: bool = False
    max_pets: int = 0
    pet_charge_per_night: int = 0
    amenities: list[str] = []
    is_published: bool = False
    is_featured: bool = False
    override_house_rules: bool = False
    override_amenities: bool = False
    override_details: bool = False
    property_type: PropertyType = "villa"
    categories: list[Category] = []
    experience_tags: list[ExperienceTag] = []
    number_of_rooms: int = 1
    about_stay: str = ""
    the_space: str = ""
    location_notes: str = ""
    what_guests_love: str = ""
    things_to_know: str = ""
    cancellation_policy: CancellationPolicy = "flexible"
    images: list[PropertyImageCreate] = Field(default_factory=list)


class PropertyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    contact_whatsapp: str | None = None
    contact_spare_phone: str | None = None
    booking_email_instructions: str | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    house_rules: list[str] | None = None
    local_recommendations: list[str] | None = None
    price_per_night: int | None = None
    cleaning_fee: int | None = None
    extra_guest_charge_per_night: int | None = None
    base_guests: int | None = None
    max_guests: int | None = None
    bedrooms: int | None = None
    bathrooms: int | None = None
    bathrooms_detail: list[dict] | None = None
    spaces_detail: list[dict] | None = None
    min_nights: int | None = None
    pets_allowed: bool | None = None
    max_pets: int | None = None
    pet_charge_per_night: int | None = None
    amenities: list[str] | None = None
    is_published: bool | None = None
    is_featured: bool | None = None
    override_house_rules: bool | None = None
    override_amenities: bool | None = None
    override_details: bool | None = None
    property_type: PropertyType | None = None
    categories: list[Category] | None = None
    experience_tags: list[ExperienceTag] | None = None
    number_of_rooms: int | None = None
    about_stay: str | None = None
    the_space: str | None = None
    location_notes: str | None = None
    what_guests_love: str | None = None
    things_to_know: str | None = None
    cancellation_policy: CancellationPolicy | None = None
    images: list[PropertyImageCreate] | None = None


class PropertyListOut(BaseModel):
    items: list[PropertyOut]
    total: int
    page: int
    limit: int

class HostPropertyOut(PropertyOut):
    """Owner/admin view: includes the unpublished edit buffer and the last rejection reason."""
    pending_changes: dict | None = None
    rejection_reason: str | None = None


class RejectListingIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class VerificationUpdateIn(BaseModel):
    status: VerificationStatus
