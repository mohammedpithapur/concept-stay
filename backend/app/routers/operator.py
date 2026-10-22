import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_operator
from app.models.experience import Experience
from app.models.user import User, UserRole
from app.routers import admin as admin_router
from app.schemas.experience import ExperienceIn, ExperienceOut, ExperiencePatch

router = APIRouter(prefix="/operator", tags=["operator"])

_NON_LIVE = ("draft", "pending_review", "rejected")


async def load_owned_experience(experience_id: uuid.UUID, operator: User, db: AsyncSession) -> Experience:
    exp = await db.get(Experience, experience_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experience not found")
    if exp.operator_id != operator.id and operator.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="You do not own this experience")
    return exp


@router.get("/experiences", response_model=list[ExperienceOut])
async def list_my_experiences(operator: User = Depends(get_operator), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Experience).where(Experience.operator_id == operator.id).order_by(Experience.created_at.desc())
    )
    return result.scalars().all()


@router.post("/experiences", response_model=ExperienceOut)
async def create_my_experience(
    data: ExperienceIn, operator: User = Depends(get_operator), db: AsyncSession = Depends(get_db)
):
    exp = Experience(operator_id=operator.id, approval_status="pending_review", is_published=False, **data.model_dump())
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


@router.patch("/experiences/{experience_id}", response_model=ExperienceOut)
async def edit_my_experience(
    experience_id: uuid.UUID,
    data: ExperiencePatch,
    operator: User = Depends(get_operator),
    db: AsyncSession = Depends(get_db),
):
    exp = await load_owned_experience(experience_id, operator, db)
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return exp
    if exp.approval_status in _NON_LIVE:
        # Not live yet: edit in place and (re)submit for review.
        for key, value in changes.items():
            setattr(exp, key, value)
        exp.approval_status = "pending_review"
    else:
        # Live listing: the public keeps the last approved data until the admin approves the edit.
        exp.pending_changes = {**(exp.pending_changes or {}), **changes}
    exp.rejection_reason = None
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/experiences/{experience_id}/unpublish", response_model=ExperienceOut)
async def unpublish_my_experience(
    experience_id: uuid.UUID, operator: User = Depends(get_operator), db: AsyncSession = Depends(get_db)
):
    exp = await load_owned_experience(experience_id, operator, db)
    exp.is_published = False  # confirmed bookings stand; only the admin can publish again
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/upload-image")
async def operator_upload_image(file: UploadFile = File(...), operator: User = Depends(get_operator)):
    return await admin_router.upload_image_file(file=file, admin=operator)
