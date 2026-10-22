"""Admin-editable settings kept in the app_settings table, with config defaults."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.app_setting import AppSetting

COMMISSION_KEY = "experience_commission_percent"


async def get_commission_percent(db: AsyncSession) -> int:
    row = await db.get(AppSetting, COMMISSION_KEY)
    if row is None:
        return settings.EXPERIENCE_COMMISSION_PERCENT
    try:
        return max(0, min(100, int(row.value)))
    except ValueError:
        return settings.EXPERIENCE_COMMISSION_PERCENT


async def set_commission_percent(db: AsyncSession, percent: int) -> None:
    """Does not commit."""
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100")
    row = await db.get(AppSetting, COMMISSION_KEY)
    if row is None:
        db.add(AppSetting(key=COMMISSION_KEY, value=str(percent)))
    else:
        row.value = str(percent)
