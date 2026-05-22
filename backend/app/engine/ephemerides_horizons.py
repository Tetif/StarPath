"""JPL Horizons API fallback (optional)."""

from datetime import datetime

from app.core.config import settings
from app.core.types import BodyId


async def fetch_horizons_state(body_id: BodyId, epoch: datetime) -> dict | None:
    if not settings.jpl_horizons_enabled:
        return None
    return None
