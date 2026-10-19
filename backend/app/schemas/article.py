from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class ArticleCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    excerpt: str | None = Field(default=None, max_length=500)
    content: str = Field(min_length=10)
    cover_image_url: str | None = None
    author_name: str = Field(default="Concept Stay Team", max_length=100)
    read_time_minutes: int = Field(default=3, ge=1, le=120)
    tags: list[str] = Field(default_factory=list)
    is_published: bool = True


class ArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    excerpt: str | None = None
    content: str | None = Field(default=None, min_length=10)
    cover_image_url: str | None = None
    author_name: str | None = None
    read_time_minutes: int | None = Field(default=None, ge=1, le=120)
    tags: list[str] | None = None
    is_published: bool | None = None


class ArticleOut(BaseModel):
    id: UUID
    title: str
    slug: str
    excerpt: str | None = None
    content: str
    cover_image_url: str | None = None
    author_name: str
    read_time_minutes: int
    tags: list[str]
    is_published: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListOut(BaseModel):
    items: list[ArticleOut]
    total: int
    page: int
    limit: int
