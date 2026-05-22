from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.core.types import BodyId, Frame, TrajectoryKind


@dataclass
class BodyInfo:
    id: BodyId
    name: str
    radius_km: float
    color: str
    texture_url: str
    soi_radius_km: float | None = None


BODY_CATALOG: dict[BodyId, BodyInfo] = {
    BodyId.SUN: BodyInfo(BodyId.SUN, "Sun", 696_340, "#FDB813", ""),
    BodyId.MERCURY: BodyInfo(
        BodyId.MERCURY,
        "Mercury",
        2_439.7,
        "#B5B5B5",
        "https://upload.wikimedia.org/wikipedia/commons/4/4a/Mercury_in_true_color.jpg",
        112_000,
    ),
    BodyId.VENUS: BodyInfo(
        BodyId.VENUS,
        "Venus",
        6_051.8,
        "#E6C87A",
        "https://upload.wikimedia.org/wikipedia/commons/e/e5/Venus-real_color.jpg",
        616_000,
    ),
    BodyId.EARTH: BodyInfo(
        BodyId.EARTH,
        "Earth",
        6_371.0,
        "#2E86AB",
        "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg",
        925_000,
    ),
    BodyId.MOON: BodyInfo(
        BodyId.MOON,
        "Moon",
        1_737.4,
        "#C0C0C0",
        "https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg",
        66_000,
    ),
    BodyId.MARS: BodyInfo(
        BodyId.MARS,
        "Mars",
        3_389.5,
        "#CD5C5C",
        "https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg",
        577_000,
    ),
    BodyId.JUPITER: BodyInfo(
        BodyId.JUPITER,
        "Jupiter",
        69_911,
        "#C88B3A",
        "https://upload.wikimedia.org/wikipedia/commons/e/e2/Jupiter.jpg",
        48_200_000,
    ),
    BodyId.SATURN: BodyInfo(
        BodyId.SATURN,
        "Saturn",
        58_232,
        "#F4D59E",
        "https://upload.wikimedia.org/wikipedia/commons/c/c7/Saturn_during_Equinox.jpg",
        54_800_000,
    ),
    BodyId.URANUS: BodyInfo(
        BodyId.URANUS,
        "Uranus",
        25_362,
        "#73C2FB",
        "https://upload.wikimedia.org/wikipedia/commons/3/3d/Uranus2.jpg",
        51_800_000,
    ),
    BodyId.NEPTUNE: BodyInfo(
        BodyId.NEPTUNE,
        "Neptune",
        24_622,
        "#3F54BA",
        "https://upload.wikimedia.org/wikipedia/commons/5/56/Neptune_Full.jpg",
        86_000_000,
    ),
}


@dataclass
class OrbitalMission:
    origin: BodyId
    destination: BodyId
    departure_window_start: datetime
    departure_window_end: datetime
    allow_gravity_assist: bool = False
    assist_bodies: list[BodyId] | None = None
    frame: Frame = Frame.J2000
    use_barycenter: bool = False
    weights: dict[str, float] = field(default_factory=lambda: {"time": 0.5, "delta_v": 0.5})
    vehicle_id: str | None = "starship"

    def validate(self) -> None:
        if self.origin == self.destination:
            raise ValueError("Origin and destination must differ")
        if self.departure_window_end <= self.departure_window_start:
            raise ValueError("Departure window end must be after start")
        if self.origin not in BODY_CATALOG or self.destination not in BODY_CATALOG:
            raise ValueError("Unknown body in mission")
        from app.engine.vehicle import resolve_vehicle

        resolve_vehicle(self.vehicle_id)


@dataclass
class GridPoint:
    departure_epoch: datetime
    arrival_epoch: datetime
    tof_days: float
    delta_v_total: float
    delta_v1: float
    delta_v2: float
    row: int
    col: int


@dataclass
class PorkchopResult:
    departure_epochs: list[str]
    tof_days: list[float]
    delta_v: list[list[float | None]]
    fastest: GridPoint
    cheapest: GridPoint
    balanced: GridPoint
    launch_window: dict[str, Any] = field(default_factory=dict)


@dataclass
class StateVector:
    epoch: datetime
    x: float
    y: float
    z: float
    vx: float
    vy: float
    vz: float


@dataclass
class SOITransition:
    epoch: datetime
    from_body: BodyId
    to_body: BodyId


@dataclass
class LegMetric:
    from_body: BodyId
    to_body: BodyId
    dv_departure: float
    dv_arrival: float


@dataclass
class TrajectoryResult:
    kind: TrajectoryKind
    grid_point: GridPoint
    states: list[StateVector]
    soi_transitions: list[SOITransition] = field(default_factory=list)
    czml_path: str | None = None
    assist_bodies: list[BodyId] = field(default_factory=list)
    leg_metrics: list[LegMetric] = field(default_factory=list)
