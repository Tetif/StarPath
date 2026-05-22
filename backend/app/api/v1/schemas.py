from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.calculation_mode import CalculationMode
from app.core.types import BodyId, TaskStatus


class WeightsSchema(BaseModel):
    time: float = 0.5
    delta_v: float = 0.5


class VehicleSchema(BaseModel):
    id: str
    name: str
    description: str
    max_delta_v_total_km_s: float
    max_delta_v_departure_km_s: float
    max_delta_v_arrival_km_s: float
    theoretical_max_delta_v_km_s: float | None = None
    dry_mass_t: float | None = None
    propellant_mass_t: float | None = None
    payload_mass_t: float | None = None
    isp_vacuum_s: float | None = None


class CalculateRequest(BaseModel):
    origin: BodyId
    destination: BodyId
    departure_from: datetime
    departure_to: datetime | None = None  # deprecated; ignored, horizon is computed server-side
    allow_gravity_assist: bool = False
    use_barycenter: bool = False
    vehicle_id: str = "starship"
    calculation_mode: CalculationMode = CalculationMode.FAST
    weights: WeightsSchema = Field(default_factory=WeightsSchema)


class CalculateResponse(BaseModel):
    task_id: str


class GridPointMetrics(BaseModel):
    departure_epoch: str
    arrival_epoch: str
    tof_days: float
    delta_v_total: float
    delta_v1: float
    delta_v2: float
    row: int = 0
    col: int = 0


class LegMetricSchema(BaseModel):
    from_body: str
    to_body: str
    dv_departure: float
    dv_arrival: float


class TrajectoryResultSchema(BaseModel):
    metrics: GridPointMetrics
    czml_url: str
    soi_transitions: list[dict[str, Any]] = []
    assist_bodies: list[str] = []
    leg_metrics: list[LegMetricSchema] = []


class PorkchopSchema(BaseModel):
    departure_epochs: list[str]
    tof_days: list[float]
    delta_v: list[list[float | None]]


class TaskResults(BaseModel):
    launch_window: dict[str, Any] | None = None
    porkchop: PorkchopSchema | None = None
    trajectories: dict[str, TrajectoryResultSchema] | None = None


class TaskResponse(BaseModel):
    status: TaskStatus
    progress: int = 0
    stage: str | None = None
    error: str | None = None
    results: TaskResults | None = None


class PreviewResponse(BaseModel):
    departure_epoch: str
    arrival_epoch: str
    tof_days: float
    delta_v_total: float
    delta_v1: float
    delta_v2: float


class PresetSchema(BaseModel):
    id: str
    name: str
    description: str
    origin: BodyId
    destination: BodyId
    departure_from: datetime
    allow_gravity_assist: bool = True
    historical_note: str = ""
