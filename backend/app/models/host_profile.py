import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, utc_now

KYC_STATUSES = ("incomplete", "submitted", "verified", "rejected")
HOST_DOC_TYPES = ("aadhaar", "passport", "pan", "gst_certificate", "bank_proof")


class HostProfile(Base):
    """Legal and payout details a host must complete before the admin can pay them out."""

    __tablename__ = "host_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    legal_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pan_enc: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet ciphertext
    aadhaar_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)  # never the full number
    gst_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_holder: Mapped[str | None] = mapped_column(String(200), nullable=True)
    bank_account_enc: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet ciphertext
    bank_ifsc: Mapped[str | None] = mapped_column(String(11), nullable=True)
    kyc_status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class HostDocument(Base):
    __tablename__ = "host_documents"
    __table_args__ = (Index("ix_host_documents_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(30), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
