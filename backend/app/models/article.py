from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, Text, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base, utc_now


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        Index("ix_articles_slug", "slug", unique=True),
        Index("ix_articles_published_created", "is_published", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    excerpt: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author_name: Mapped[str] = mapped_column(String(100), default="Concept Stay Team", nullable=False)
    read_time_minutes: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    tags: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
