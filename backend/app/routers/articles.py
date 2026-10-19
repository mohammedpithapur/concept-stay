import re
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.article import Article
from app.models.user import User
from app.schemas.article import ArticleCreate, ArticleUpdate, ArticleOut, ArticleListOut
from app.dependencies import get_admin

router = APIRouter(prefix="/articles", tags=["articles"])


def slugify(text: str) -> str:
    """Generate a clean URL slug from title."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    return s or "article"


async def get_unique_slug(db: AsyncSession, base_slug: str, exclude_id: Optional[uuid.UUID] = None) -> str:
    slug = base_slug
    counter = 1
    while True:
        query = select(Article.id).where(Article.slug == slug)
        if exclude_id:
            query = query.where(Article.id != exclude_id)
        existing = await db.scalar(query)
        if not existing:
            return slug
        counter += 1
        slug = f"{base_slug}-{counter}"


# ─────────────────────────────────────────────────────────────────────────────
# Public Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("", response_model=ArticleListOut)
async def list_public_articles(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=9, ge=1, le=50),
    search: Optional[str] = None,
    tag: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List published articles for public reading."""
    base_query = select(Article).where(Article.is_published.is_(True))

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        base_query = base_query.where(
            or_(
                func.lower(Article.title).like(term),
                func.lower(Article.excerpt).like(term),
                func.lower(Article.content).like(term),
            )
        )

    if tag and tag.strip():
        # JSONB contains check or text check
        base_query = base_query.where(Article.tags.contains([tag.strip()]))

    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total = await db.scalar(count_query) or 0

    # Paginate
    offset = (page - 1) * limit
    results = await db.execute(
        base_query.order_by(desc(Article.created_at)).offset(offset).limit(limit)
    )
    items = list(results.scalars().all())

    return ArticleListOut(
        items=[ArticleOut.model_validate(a) for a in items],
        total=total,
        page=page,
        limit=limit,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Admin Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/all", response_model=ArticleListOut)
async def list_admin_articles(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = None,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all articles including drafts for admin management."""
    base_query = select(Article)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        base_query = base_query.where(
            or_(
                func.lower(Article.title).like(term),
                func.lower(Article.slug).like(term),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = await db.scalar(count_query) or 0

    offset = (page - 1) * limit
    results = await db.execute(
        base_query.order_by(desc(Article.created_at)).offset(offset).limit(limit)
    )
    items = list(results.scalars().all())

    return ArticleListOut(
        items=[ArticleOut.model_validate(a) for a in items],
        total=total,
        page=page,
        limit=limit,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public Article Detail
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{slug_or_id}", response_model=ArticleOut)
async def get_article(slug_or_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve an article by its slug or UUID."""
    # Check if slug_or_id is a UUID
    article = None
    try:
        art_uuid = uuid.UUID(slug_or_id)
        article = await db.get(Article, art_uuid)
    except ValueError:
        pass

    if not article:
        article = await db.scalar(
            select(Article).where(Article.slug == slug_or_id.lower().strip())
        )

    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    return ArticleOut.model_validate(article)


@router.post("/admin", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
async def create_article(
    data: ArticleCreate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new article or blog post."""
    base_slug = slugify(data.slug) if data.slug and data.slug.strip() else slugify(data.title)
    final_slug = await get_unique_slug(db, base_slug)

    # Estimate read time if not explicitly provided or default
    word_count = len(data.content.split())
    read_time = max(1, round(word_count / 200)) if data.read_time_minutes == 3 else data.read_time_minutes

    clean_tags = [t.strip() for t in data.tags if t and t.strip()]

    article = Article(
        title=data.title.strip(),
        slug=final_slug,
        excerpt=data.excerpt.strip() if data.excerpt else None,
        content=data.content,
        cover_image_url=data.cover_image_url.strip() if data.cover_image_url else None,
        author_name=data.author_name.strip() if data.author_name else "Concept Stay Team",
        read_time_minutes=read_time,
        tags=clean_tags,
        is_published=data.is_published,
    )

    db.add(article)
    await db.commit()
    await db.refresh(article)
    return ArticleOut.model_validate(article)


@router.patch("/admin/{article_id}", response_model=ArticleOut)
async def update_article(
    article_id: uuid.UUID,
    data: ArticleUpdate,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing article."""
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if "title" in data.model_fields_set and data.title is not None:
        article.title = data.title.strip()

    if "slug" in data.model_fields_set and data.slug is not None and data.slug.strip():
        base_slug = slugify(data.slug)
        article.slug = await get_unique_slug(db, base_slug, exclude_id=article.id)

    if "excerpt" in data.model_fields_set:
        article.excerpt = data.excerpt.strip() if data.excerpt else None

    if "content" in data.model_fields_set and data.content is not None:
        article.content = data.content
        if data.read_time_minutes is None:
            word_count = len(article.content.split())
            article.read_time_minutes = max(1, round(word_count / 200))

    if "read_time_minutes" in data.model_fields_set and data.read_time_minutes is not None:
        article.read_time_minutes = data.read_time_minutes

    if "cover_image_url" in data.model_fields_set:
        article.cover_image_url = data.cover_image_url.strip() if (data.cover_image_url and data.cover_image_url.strip()) else None

    if "author_name" in data.model_fields_set and data.author_name is not None:
        article.author_name = data.author_name.strip()

    if "tags" in data.model_fields_set and data.tags is not None:
        article.tags = [t.strip() for t in data.tags if t and t.strip()]

    if "is_published" in data.model_fields_set and data.is_published is not None:
        article.is_published = data.is_published

    await db.commit()
    await db.refresh(article)
    return ArticleOut.model_validate(article)


@router.delete("/admin/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_article(
    article_id: uuid.UUID,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an article."""
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    await db.delete(article)
    await db.commit()
    return None
