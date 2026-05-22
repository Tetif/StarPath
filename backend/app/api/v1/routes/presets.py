from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.api.v1.schemas import PresetSchema
from app.cache.redis_cache import cache
from app.core.config import settings
from app.core.types import BodyId

router = APIRouter(prefix="/presets", tags=["presets"])

PRESETS: list[PresetSchema] = [
    PresetSchema(
        id="voyager1",
        name="Voyager 1",
        description="Grand tour: Jupiter and Saturn gravity assists (1977 launch window).",
        origin=BodyId.EARTH,
        destination=BodyId.SATURN,
        departure_from=datetime(1977, 9, 5, tzinfo=timezone.utc),
        allow_gravity_assist=True,
        historical_note="Launched Sep 5, 1977. Flybys of Jupiter (1979) and Saturn (1980).",
    ),
    PresetSchema(
        id="cassini",
        name="Cassini-Huygens",
        description="VVEJGA trajectory to Saturn (1997 launch).",
        origin=BodyId.EARTH,
        destination=BodyId.SATURN,
        departure_from=datetime(1997, 10, 15, tzinfo=timezone.utc),
        allow_gravity_assist=True,
        historical_note="Venus-Venus-Earth-Jupiter gravity assists before Saturn orbit insertion.",
    ),
    PresetSchema(
        id="mars2020",
        name="Mars 2020 (Perseverance)",
        description="Direct Earth-Mars transfer in July 2020 window.",
        origin=BodyId.EARTH,
        destination=BodyId.MARS,
        departure_from=datetime(2020, 7, 30, tzinfo=timezone.utc),
        allow_gravity_assist=False,
        historical_note="Launched July 30, 2020. Landed Jezero Crater, Feb 2021.",
    ),
]


@router.get("", response_model=list[PresetSchema])
async def list_presets():
    return PRESETS


@router.get("/{preset_id}", response_model=PresetSchema)
async def get_preset(preset_id: str):
    cache_key = f"preset:{preset_id}"
    cached = cache.get(cache_key)
    if cached:
        return PresetSchema(**cached)

    for preset in PRESETS:
        if preset.id == preset_id:
            cache.set(cache_key, preset.model_dump(mode="json"), settings.preset_cache_ttl)
            return preset
    raise HTTPException(status_code=404, detail="Preset not found")
