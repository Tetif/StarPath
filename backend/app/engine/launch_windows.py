"""Synodic periods and launch window analysis."""

from datetime import datetime, timedelta, timezone

from app.core.types import BodyId
from app.engine.mission import GridPoint

SYNODIC_PERIODS_DAYS: dict[tuple[BodyId, BodyId], float] = {
    (BodyId.EARTH, BodyId.MARS): 779.0,
    (BodyId.EARTH, BodyId.VENUS): 583.9,
    (BodyId.EARTH, BodyId.MERCURY): 115.9,
    (BodyId.EARTH, BodyId.JUPITER): 398.9,
    (BodyId.EARTH, BodyId.SATURN): 378.0,
    (BodyId.EARTH, BodyId.URANUS): 369.7,
    (BodyId.EARTH, BodyId.NEPTUNE): 367.5,
    (BodyId.MARS, BodyId.JUPITER): 816.4,
    (BodyId.MARS, BodyId.SATURN): 702.0,
}


def get_synodic_period(origin: BodyId, destination: BodyId) -> float | None:
    key = (origin, destination)
    rev = (destination, origin)
    return SYNODIC_PERIODS_DAYS.get(key) or SYNODIC_PERIODS_DAYS.get(rev)


DEFAULT_SEARCH_HORIZON_DAYS = 730.0


def get_search_horizon_days(origin: BodyId, destination: BodyId) -> float:
    """Forward search window for porkchop / fastest: 2 synodic periods."""
    period = get_synodic_period(origin, destination)
    if period is None:
        return DEFAULT_SEARCH_HORIZON_DAYS
    return period * 2.0


def next_optimal_window(
    origin: BodyId,
    destination: BodyId,
    from_date: datetime,
    optimal_departure: datetime | None = None,
) -> dict:
    period = get_synodic_period(origin, destination)
    if period is None:
        return {"synodic_period_days": None, "next_window_start": None, "warning": None}

    if optimal_departure is None:
        optimal_departure = from_date

    if from_date.tzinfo is None:
        from_date = from_date.replace(tzinfo=timezone.utc)

    days_since = (from_date - optimal_departure.replace(tzinfo=timezone.utc)).days
    if abs(days_since) <= period * 0.15:
        warning = None
    else:
        warning = (
            f"Current date is outside the optimal launch window. "
            f"Next optimal window near {optimal_departure.date().isoformat()} "
            f"(synodic period {period:.0f} days)."
        )

    next_start = optimal_departure + timedelta(days=period)
    return {
        "synodic_period_days": period,
        "optimal_departure": optimal_departure.isoformat(),
        "next_window_start": next_start.isoformat(),
        "warning": warning,
    }


def analyze_launch_window(
    origin: BodyId,
    destination: BodyId,
    departure_from: datetime,
    cheapest: GridPoint | None = None,
) -> dict:
    optimal = cheapest.departure_epoch if cheapest else departure_from
    info = next_optimal_window(origin, destination, departure_from, optimal)
    return info
