"""Marketplace taxonomy shared by models, schemas and filters."""
from typing import Literal

PROPERTY_TYPES = ("homestay", "guesthouse", "villa", "farm_stay", "boutique_stay", "cottage", "hostel")
CATEGORIES = ("offbeat", "mountain", "lakeside", "farm", "homestay", "boutique", "nature", "budget")
EXPERIENCE_TAGS = ("romantic", "family", "solo", "workation", "adventure", "nature", "wellness", "remote_offgrid")
VERIFICATION_STATUSES = ("unverified", "pending", "verified", "rejected", "suspended")
APPROVAL_STATUSES = ("draft", "pending_review", "approved", "rejected")
CANCELLATION_POLICIES = ("flexible", "moderate", "non_refundable")

PropertyType = Literal["homestay", "guesthouse", "villa", "farm_stay", "boutique_stay", "cottage", "hostel"]
Category = Literal["offbeat", "mountain", "lakeside", "farm", "homestay", "boutique", "nature", "budget"]
ExperienceTag = Literal["romantic", "family", "solo", "workation", "adventure", "nature", "wellness", "remote_offgrid"]
VerificationStatus = Literal["unverified", "pending", "verified", "rejected", "suspended"]
CancellationPolicy = Literal["flexible", "moderate", "non_refundable"]

CATEGORY_LABELS = {
    "offbeat": "Offbeat Stays",
    "mountain": "Mountain Stays",
    "lakeside": "Lakeside",
    "farm": "Farm Stays",
    "homestay": "Homestays",
    "boutique": "Boutique",
    "nature": "Nature Stays",
    "budget": "Budget Gems",
}
