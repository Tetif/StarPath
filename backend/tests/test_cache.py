"""Cache key and serialization tests."""

from datetime import datetime, timezone

from app.cache.redis_cache import porkchop_cache_key, trajectory_cache_key
from app.engine.mission import GridPoint, LegMetric, StateVector, TrajectoryResult
from app.core.types import BodyId, TrajectoryKind
from app.tasks.calculate import (
    _cache_to_trajectory,
    _grid_point_to_dict,
    _trajectory_to_cache,
)


def test_porkchop_cache_key_includes_mission_flags():
    base = porkchop_cache_key("earth", "mars", "2026-01-01", "starship")
    ga = porkchop_cache_key("earth", "mars", "2026-01-01", "starship", True)
    weights = porkchop_cache_key(
        "earth", "mars", "2026-01-01", "starship", False, {"time": 0.8, "delta_v": 0.2}
    )
    assert base != ga
    assert base != weights


def test_trajectory_cache_key_includes_vehicle_and_ga():
    direct = trajectory_cache_key("earth", "mars", "2026-01-01T00:00:00", 200.0, "balanced")
    starship = trajectory_cache_key(
        "earth", "mars", "2026-01-01T00:00:00", 200.0, "balanced", "starship"
    )
    ga = trajectory_cache_key(
        "earth", "mars", "2026-01-01T00:00:00", 200.0, "balanced", "starship", True
    )
    assert direct != starship
    assert starship != ga


def test_trajectory_cache_roundtrip_excludes_czml_url():
    dep = datetime(2026, 6, 1, tzinfo=timezone.utc)
    arr = datetime(2026, 12, 18, tzinfo=timezone.utc)
    gp = GridPoint(dep, arr, 200.0, 5000.0, 3000.0, 2000.0, 0, 0)
    states = [
        StateVector(dep, 1e11, 0, 0, 0, 20000, 0),
        StateVector(arr, 1.5e11, 0, 0, 0, 15000, 0),
    ]
    traj = TrajectoryResult(
        kind=TrajectoryKind.BALANCED,
        grid_point=gp,
        states=states,
        leg_metrics=[
            LegMetric(BodyId.EARTH, BodyId.MARS, 3000.0, 2000.0),
        ],
    )
    cached = _trajectory_to_cache(traj)
    assert "czml_url" not in cached
    restored = _cache_to_trajectory(cached)
    assert restored.grid_point.delta_v1 == 3000.0
    assert restored.grid_point.delta_v2 == 2000.0
    assert len(restored.states) == 2
    assert restored.leg_metrics[0].from_body == BodyId.EARTH


def test_grid_point_dict_preserves_dv_split():
    dep = datetime(2026, 1, 1, tzinfo=timezone.utc)
    gp = GridPoint(dep, dep, 100.0, 9000.0, 6000.0, 3000.0, 0, 0)
    d = _grid_point_to_dict(gp)
    assert d["delta_v1"] == 6000.0
    assert d["delta_v2"] == 3000.0
