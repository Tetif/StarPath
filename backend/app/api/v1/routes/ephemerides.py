"""Sample heliocentric body positions for the 3D viewer."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.core.types import BodyId
from app.engine.ephemerides import get_state_at

router = APIRouter(tags=["ephemerides"])

SAMPLE_BODIES = [
    BodyId.MERCURY,
    BodyId.VENUS,
    BodyId.EARTH,
    BodyId.MARS,
    BodyId.MOON,
    BodyId.JUPITER,
    BodyId.SATURN,
    BodyId.URANUS,
    BodyId.NEPTUNE,
]


def _parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/ephemeris/sample")
async def sample_ephemeris(
    time_from: str = Query(..., alias="from", description="ISO8601 start time"),
    time_to: str = Query(..., alias="to", description="ISO8601 end time"),
    step_hours: float = Query(24.0, ge=1.0, le=168.0),
    bodies: str = Query(
        "mercury,venus,earth,mars,moon,jupiter,saturn,uranus,neptune",
        description="Comma-separated body ids",
    ),
) -> dict:
    start = _parse_iso(time_from)
    end = _parse_iso(time_to)
    if end <= start:
        end = start + timedelta(days=1)

    requested = []
    for token in bodies.split(","):
        token = token.strip().lower()
        if not token or token == "sun":
            continue
        try:
            requested.append(BodyId(token))
        except ValueError:
            continue

    if not requested:
        requested = list(SAMPLE_BODIES)

    step_s = step_hours * 3600.0
    total_s = (end - start).total_seconds()
    n_steps = max(int(total_s / step_s), 1)

    result_bodies: dict[str, dict] = {}
    epoch_iso = start.strftime("%Y-%m-%dT%H:%M:%SZ")

    for body_id in requested:
        samples: list[float] = []
        for i in range(n_steps + 1):
            t = start + timedelta(seconds=min(i * step_s, total_s))
            pos, _ = get_state_at(body_id, t)
            dt = (t - start).total_seconds()
            samples.extend([dt, float(pos[0]), float(pos[1]), float(pos[2])])
        result_bodies[body_id.value] = {"epoch": epoch_iso, "cartesian": samples}

    return {"epoch": epoch_iso, "bodies": result_bodies}
