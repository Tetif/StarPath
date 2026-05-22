"""State vectors to CZML with HERMITE interpolation."""

import json
from datetime import datetime, timezone
from pathlib import Path as FilePath

from czml3.core import Document, Packet, Path as CzmlPath, Position, CZML_VERSION
from czml3.enums import InterpolationAlgorithms, ReferenceFrames

from app.core.calculation_mode import ModeSettings, get_mode_settings
from app.core.types import TrajectoryKind
from app.czml.simplify import simplify_trajectory
from app.engine.mission import StateVector, TrajectoryResult

TRAJECTORY_RGBA = {
    TrajectoryKind.FASTEST: [255, 68, 68, 255],
    TrajectoryKind.CHEAPEST: [68, 136, 255, 255],
    TrajectoryKind.BALANCED: [68, 204, 102, 255],
}


def _to_iso(epoch: datetime) -> str:
    if epoch.tzinfo is None:
        epoch = epoch.replace(tzinfo=timezone.utc)
    return epoch.strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_cartesian(states: list[StateVector]) -> list[float]:
    """CZML cartesian samples: [seconds, x, y, z, ...] relative to first epoch."""
    if not states:
        return []
    t0 = states[0].epoch.timestamp()
    data: list[float] = []
    for s in states:
        dt = s.epoch.timestamp() - t0
        data.extend([dt, s.x, s.y, s.z])
    return data


def _build_cartesian_velocity(states: list[StateVector]) -> list[float]:
    """CZML samples: [seconds, x, y, z, vx, vy, vz, ...] relative to first epoch."""
    if not states:
        return []
    t0 = states[0].epoch.timestamp()
    data: list[float] = []
    for s in states:
        dt = s.epoch.timestamp() - t0
        data.extend([dt, s.x, s.y, s.z, s.vx, s.vy, s.vz])
    return data


def build_czml_packet(
    result: TrajectoryResult,
    entity_id: str | None = None,
    mode_settings: ModeSettings | None = None,
) -> Packet:
    if len(result.states) < 2:
        raise ValueError(
            f"Trajectory {result.kind.value} has insufficient states ({len(result.states)}) for CZML export"
        )

    # Keep enough interior points so transfer arcs stay curved after simplification.
    preserve: set[int] = set()
    if len(result.states) > 2:
        preserve.add(0)
        preserve.add(len(result.states) - 1)
    cfg = mode_settings or get_mode_settings("fast")
    states = simplify_trajectory(
        result.states,
        tolerance_m=cfg.czml_tolerance_m,
        min_points=cfg.czml_min_points,
        preserve_indices=preserve,
    )
    if len(states) < 2:
        states = result.states

    kind = result.kind
    rgba = TRAJECTORY_RGBA.get(kind, TRAJECTORY_RGBA[TrajectoryKind.BALANCED])
    eid = entity_id or f"trajectory-{kind.value}"

    position = Position(
        epoch=_to_iso(states[0].epoch),
        cartesianVelocity=_build_cartesian_velocity(states),
        interpolationAlgorithm=InterpolationAlgorithms.HERMITE,
        interpolationDegree=3,
        referenceFrame=ReferenceFrames.INERTIAL,
    )

    packet = Packet(
        id=eid,
        name=f"{kind.value.title()} trajectory",
        position=position,
        point={
            "pixelSize": 12,
            "color": {"rgba": rgba},
            "outlineColor": {"rgba": [255, 255, 255, 200]},
            "outlineWidth": 2,
        },
        path=CzmlPath(
            material={"solidColor": {"color": {"rgba": rgba}}},
            width=3,
            resolution=120,
            leadTime=0,
            trailTime=86400 * 180,
        ),
        label={
            "text": kind.value.title(),
            "fillColor": {"rgba": rgba},
            "style": "FILL",
        },
    )
    return packet


def build_czml_document(
    results: list[TrajectoryResult],
    mode_settings: ModeSettings | None = None,
) -> Document:
    preamble = Packet(id="document", name="StarPath", version=CZML_VERSION)
    packets = [preamble] + [build_czml_packet(r, mode_settings=mode_settings) for r in results]
    return Document(packets=packets)


def save_czml(
    results: list[TrajectoryResult],
    output_path: FilePath,
    mode_settings: ModeSettings | None = None,
) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = build_czml_document(results, mode_settings=mode_settings)
    data = [p.model_dump(exclude_none=True, by_alias=True) for p in doc.packets]
    output_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return str(output_path)


def save_single_czml(
    result: TrajectoryResult,
    output_path: FilePath,
    mode_settings: ModeSettings | None = None,
) -> str:
    return save_czml([result], output_path, mode_settings=mode_settings)
