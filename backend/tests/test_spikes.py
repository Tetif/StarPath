"""Spike tests validating core integrations."""

from datetime import datetime, timezone

import pytest

from app.core.types import BodyId
from app.engine.mission import OrbitalMission, StateVector
from app.engine.porkchop import compute_single_cell
from app.czml.builder import build_czml_packet, save_single_czml
from czml3.enums import InterpolationAlgorithms
from app.engine.mission import TrajectoryResult, GridPoint
from app.core.types import TrajectoryKind
from pathlib import Path
import tempfile


@pytest.mark.slow
def test_lambert_single_cell():
    mission = OrbitalMission(
        origin=BodyId.EARTH,
        destination=BodyId.MARS,
        departure_window_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        departure_window_end=datetime(2027, 1, 1, tzinfo=timezone.utc),
    )
    cell = compute_single_cell(mission, datetime(2026, 7, 1, tzinfo=timezone.utc), 200.0)
    assert cell is not None
    assert cell.delta_v_total > 0
    assert cell.tof_days == 200.0


def test_czml_hermite_export():
    states = [
        StateVector(
            datetime(2026, 1, 1, tzinfo=timezone.utc),
            1e11, 0, 0, 0, 30000, 0,
        ),
        StateVector(
            datetime(2026, 7, 1, tzinfo=timezone.utc),
            0, 1.5e11, 0, -25000, 0, 0,
        ),
    ]
    gp = GridPoint(
        departure_epoch=states[0].epoch,
        arrival_epoch=states[-1].epoch,
        tof_days=180,
        delta_v_total=5000,
        delta_v1=2500,
        delta_v2=2500,
        row=0,
        col=0,
    )
    result = TrajectoryResult(kind=TrajectoryKind.FASTEST, grid_point=gp, states=states)
    packet = build_czml_packet(result)
    assert packet.id == "trajectory-fastest"
    assert packet.position is not None
    assert packet.position.interpolationAlgorithm == InterpolationAlgorithms.HERMITE

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "test.czml"
        save_single_czml(result, path)
        assert path.exists()
        content = path.read_text()
        assert "HERMITE" in content
