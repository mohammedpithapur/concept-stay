from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.database import get_db, utc_now
from app.dependencies import get_admin, get_host
from app.models.host_profile import HostProfile
from app.models.payout import Payout
from app.models.user import User, UserRole
from app.schemas.payout import PayoutMarkPaidIn, PayoutOut

router = APIRouter(tags=["payouts"])


async def _kyc_by_host(db: AsyncSession, host_ids: set) -> dict:
    """host id -> kyc status; admin-owned payouts (legacy listings) need no KYC."""
    if not host_ids:
        return {}
    rows = (await db.execute(select(User.id, User.role, HostProfile.kyc_status)
                             .outerjoin(HostProfile, HostProfile.user_id == User.id)
                             .where(User.id.in_(host_ids)))).all()
    status = {uid: ("exempt" if role == UserRole.admin else (kyc or "incomplete")) for uid, role, kyc in rows}
    return {h: status.get(h, "incomplete") for h in host_ids}


@router.get("/admin/payouts", response_model=list[PayoutOut])
async def admin_list_payouts(
    status: str | None = Query(None, pattern="^(owed|paid|voided)$"),
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Payout).order_by(Payout.created_at.desc())
    if status:
        query = query.where(Payout.status == status)
    payouts = (await db.execute(query)).scalars().all()
    kyc = await _kyc_by_host(db, {p.host_id for p in payouts})
    return [PayoutOut.model_validate(p).model_copy(update={"host_kyc_status": kyc[p.host_id]}) for p in payouts]


@router.post("/admin/payouts/{payout_id}/mark-paid", response_model=PayoutOut)
async def admin_mark_payout_paid(
    payout_id: uuid.UUID,
    data: PayoutMarkPaidIn,
    admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    payout = await db.get(Payout, payout_id, with_for_update=True)
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout.status != "owed":
        raise HTTPException(status_code=409, detail=f"Payout is already '{payout.status}'")
    if (await _kyc_by_host(db, {payout.host_id}))[payout.host_id] not in ("verified", "exempt"):
        raise HTTPException(status_code=409, detail="Host KYC is not verified")
    payout.status = "paid"
    payout.paid_at = utc_now()
    payout.reference = data.reference
    await db.commit()
    await db.refresh(payout)
    return payout


@router.get("/host/payouts", response_model=list[PayoutOut])
async def host_list_payouts(host: User = Depends(get_host), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Payout).where(Payout.host_id == host.id).order_by(Payout.created_at.desc())
    )
    return result.scalars().all()
