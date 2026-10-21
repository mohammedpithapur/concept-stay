from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, utc_now
from app.dependencies import get_admin
from app.models.fx_rate import FxRate
from app.models.user import User
from app.services.fx import is_supported

router = APIRouter(tags=["fx"])


class FxRateIn(BaseModel):
    rate_per_inr: Decimal

    @field_validator("rate_per_inr")
    @classmethod
    def _positive(cls, v):
        if v <= 0 or v > 1000:
            raise ValueError("rate_per_inr must be greater than 0")
        return v


@router.get("/fx-rates")
async def list_fx_rates(db: AsyncSession = Depends(get_db)):
    """Supported currencies and the rate each one currently uses (units per rupee)."""
    rows = (await db.execute(select(FxRate))).scalars().all()
    rates = {r.currency: float(r.rate_per_inr) for r in rows if is_supported(r.currency)}
    rates["INR"] = 1
    return {"base": "INR", "supported": list(settings.SUPPORTED_CURRENCIES), "rates": rates}


@router.put("/admin/fx-rates/{currency}")
async def set_fx_rate(
    currency: str, data: FxRateIn, admin: User = Depends(get_admin), db: AsyncSession = Depends(get_db)
):
    """Changes the rate for NEW bookings only: a booking keeps the rate it was priced with."""
    currency = currency.upper()
    if currency == "INR" or not is_supported(currency):
        raise HTTPException(status_code=422, detail=f"{currency} is not a configurable currency")
    row = await db.get(FxRate, currency)
    if row:
        row.rate_per_inr, row.updated_at, row.updated_by = data.rate_per_inr, utc_now(), admin.id
    else:
        db.add(FxRate(currency=currency, rate_per_inr=data.rate_per_inr, updated_by=admin.id))
    await db.commit()
    return {"currency": currency, "rate_per_inr": float(data.rate_per_inr)}
