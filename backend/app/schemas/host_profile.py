import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

_PAN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_IFSC = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
_ACCOUNT = re.compile(r"^[0-9]{9,18}$")
_GST = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


class HostProfileIn(BaseModel):
    """Every field is optional so a host can save progress; completeness is checked separately."""

    legal_name: str | None = None
    phone: str | None = None
    pan_number: str | None = None
    aadhaar_last4: str | None = None
    gst_number: str | None = None
    bank_holder: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return None if isinstance(v, str) and not v.strip() else v

    @field_validator("pan_number")
    @classmethod
    def _pan(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not _PAN.match(v):
            raise ValueError("PAN must look like ABCDE1234F")
        return v

    @field_validator("aadhaar_last4")
    @classmethod
    def _aadhaar(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not re.fullmatch(r"[0-9]{4}", v):
            raise ValueError("Send only the last 4 digits of the Aadhaar number")
        return v

    @field_validator("gst_number")
    @classmethod
    def _gst(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not _GST.match(v):
            raise ValueError("GST number is not valid")
        return v

    @field_validator("bank_account_number")
    @classmethod
    def _account(cls, v):
        if v is None:
            return v
        v = v.replace(" ", "")
        if not _ACCOUNT.match(v):
            raise ValueError("Account number must be 9 to 18 digits")
        return v

    @field_validator("bank_ifsc")
    @classmethod
    def _ifsc(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not _IFSC.match(v):
            raise ValueError("IFSC must look like HDFC0001234")
        return v

    @field_validator("legal_name", "bank_holder")
    @classmethod
    def _names(cls, v):
        return v.strip()[:200] if v else v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return v.strip()[:30] if v else v


class HostDocumentOut(BaseModel):
    id: UUID
    doc_type: str
    filename: str
    mime: str
    size: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class HostProfileOut(BaseModel):
    """What the host sees: sensitive values are masked, files are listed but never linked."""

    legal_name: str | None = None
    phone: str | None = None
    pan_masked: str | None = None
    aadhaar_last4: str | None = None
    gst_number: str | None = None
    bank_holder: str | None = None
    bank_account_masked: str | None = None
    bank_ifsc: str | None = None
    kyc_status: str = "incomplete"
    rejection_reason: str | None = None
    submitted_at: datetime | None = None
    verified_at: datetime | None = None
    documents: list[HostDocumentOut] = []


class CompletenessOut(BaseModel):
    complete: bool
    missing: list[str]
    kyc_status: str


class KycListItem(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    legal_name: str | None = None
    kyc_status: str
    submitted_at: datetime | None = None


class KycDocumentAdminOut(HostDocumentOut):
    signed_url: str


class KycDetailOut(HostProfileOut):
    user_id: UUID
    email: str
    pan_number: str | None = None
    bank_account_number: str | None = None
    documents: list[KycDocumentAdminOut] = []


class KycRejectIn(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("A reason is required")
        return v[:500]
