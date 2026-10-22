"""Admin review of operator experience listings."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin
from app.models.experience import Experience
from app.models.user import User
from app.schemas.experience import ExperienceOut, RejectExperienceIn
from app.services import experience_review
from app.services.traveller_report import build_traveller_report

router = APIRouter(prefix="/admin", tags=["admin-experiences"])


async def _get(db: AsyncSession, experience_id: uuid.UUID) -> Experience:
    exp = await db.get(Experience, experience_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experience not found")
    return exp


@router.get("/experience-review-queue", response_model=list[ExperienceOut])
async def experience_review_queue(admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Experience)
        .where(or_(Experience.approval_status == "pending_review", Experience.pending_changes.is_not(None)))
        .order_by(Experience.created_at)
    )
    return result.scalars().all()


@router.post("/experiences/{experience_id}/approve", response_model=ExperienceOut)
async def approve_experience(
    experience_id: uuid.UUID, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)
):
    exp = experience_review.approve_experience(await _get(db, experience_id))
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/experiences/{experience_id}/reject", response_model=ExperienceOut)
async def reject_experience(
    experience_id: uuid.UUID,
    data: RejectExperienceIn,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    exp = experience_review.reject_experience(await _get(db, experience_id), data.reason)
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/experiences/{experience_id}/unpublish", response_model=ExperienceOut)
async def admin_unpublish_experience(
    experience_id: uuid.UUID, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)
):
    exp = await _get(db, experience_id)
    exp.is_published = False
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/experiences/{experience_id}/publish", response_model=ExperienceOut)
async def admin_publish_experience(
    experience_id: uuid.UUID, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)
):
    exp = await _get(db, experience_id)
    if exp.approval_status != "approved":
        raise HTTPException(status_code=409, detail="Only an approved experience can be published")
    exp.is_published = True
    await db.commit()
    await db.refresh(exp)
    return exp


@router.get("/traveller-report")
async def traveller_report(
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revenue per traveller (commission plus service fee, stays and experiences), highest first."""
    return await build_traveller_report(db, from_, to, limit, offset)
