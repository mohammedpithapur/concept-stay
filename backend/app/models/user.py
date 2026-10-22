import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, utc_now

import enum


class UserRole(str, enum.Enum):
    guest = "guest"
    host = "host"
    operator = "operator"
    admin = "admin"


class HostStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    suspended = "suspended"


class OperatorStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    suspended = "suspended"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.guest, nullable=False)
    host_status: Mapped[HostStatus] = mapped_column(SAEnum(HostStatus), default=HostStatus.approved, nullable=False)
    operator_status: Mapped[OperatorStatus] = mapped_column(
        SAEnum(OperatorStatus), default=OperatorStatus.approved, server_default="approved", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    open_to_connections: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
