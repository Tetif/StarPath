"""Porkchop grid Lambert solver using lamberthub + Astropy."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import numpy as np
from lamberthub import izzo2015

from app.core.calculation_mode import ModeSettings, get_mode_settings
from app.core.types import BodyId
from app.engine.ephemerides import SUN_MU, get_state_at, is_solar_distance_safe, sample_transfer_states
from app.engine.launch_windows import analyze_launch_window, get_search_horizon_days
from app.engine.mission import GridPoint, OrbitalMission, PorkchopResult
from app.engine.optimizers import find_optima
from app.engine.vehicle import VehicleId, is_transfer_feasible, resolve_vehicle, vehicle_limits_dict


def _adaptive_step_hours(
    tof_days: float,
    r1: np.ndarray,
    v1: np.ndarray,
    start: datetime,
    end: datetime,
    step_factor: float = 1.0,
) -> float:
    """Denser sampling when perihelion is low."""
    from app.engine.ephemerides import min_heliocentric_distance

    min_r = min_heliocentric_distance(r1, v1, start, end, step_hours=24.0)
    if min_r < 0.5 * 1.496e11:
        base = 1.0
    else:
        base = 3.0 if tof_days < 180 else 12.0
    return max(base * step_factor, 0.5)


ProgressCallback = Callable[[int, int, int], None]


def _normalize_epoch(epoch: datetime) -> datetime:
    if epoch.tzinfo is None:
        return epoch.replace(tzinfo=timezone.utc)
    return epoch


class _EphemerisInterpolator:
    """Coarse daily samples + linear interpolation (fast porkchop grid)."""

    def __init__(self, mission: OrbitalMission, start: datetime, end: datetime, step_days: int = 4):
        self._tracks: dict[BodyId, tuple[list[float], list[np.ndarray], list[np.ndarray]]] = {}
        start = _normalize_epoch(start)
        end = _normalize_epoch(end)
        if end <= start:
            end = start + timedelta(days=1)
        span_days = (end - start).total_seconds() / 86400.0
        n = max(int(span_days / step_days) + 1, 2)
        times = [start + timedelta(days=(span_days * i) / (n - 1)) for i in range(n)]
        t_sec = [(t - start).total_seconds() for t in times]

        for body in (mission.origin, mission.destination):
            positions: list[np.ndarray] = []
            velocities: list[np.ndarray] = []
            for t in times:
                pos, vel = get_state_at(body, t)
                positions.append(pos)
                velocities.append(vel)
            self._tracks[body] = (t_sec, positions, velocities)

        self._t0 = start

    def state_at(self, body: BodyId, epoch: datetime) -> tuple[np.ndarray, np.ndarray]:
        epoch = _normalize_epoch(epoch)
        t_sec, positions, velocities = self._tracks[body]
        query = (epoch - self._t0).total_seconds()
        if query <= t_sec[0]:
            return positions[0].copy(), velocities[0].copy()
        if query >= t_sec[-1]:
            return positions[-1].copy(), velocities[-1].copy()
        idx = int(np.searchsorted(t_sec, query, side="right"))
        t0, t1 = t_sec[idx - 1], t_sec[idx]
        alpha = 0.0 if t1 <= t0 else (query - t0) / (t1 - t0)
        p0, p1 = positions[idx - 1], positions[idx]
        v0, v1 = velocities[idx - 1], velocities[idx]
        pos = p0 * (1.0 - alpha) + p1 * alpha
        vel = v0 * (1.0 - alpha) + v1 * alpha
        return pos, vel


def _build_ephemeris_interpolator(
    mission: OrbitalMission,
    departure_dates: list[datetime],
    tof_days_list: list[float],
    step_days: int,
) -> _EphemerisInterpolator:
    start = _normalize_epoch(departure_dates[0])
    max_tof = max(tof_days_list) if tof_days_list else 400.0
    end = _normalize_epoch(departure_dates[-1]) + timedelta(days=float(max_tof) + 7.0)
    return _EphemerisInterpolator(mission, start, end, step_days=step_days)


def _solve_lambert_cell(
    mission: OrbitalMission,
    departure: datetime,
    tof_days: float,
    ephem: _EphemerisInterpolator | None = None,
    grid_sun_check_step_hours: float | None = None,
    preview_sun_check: bool = False,
) -> GridPoint | None:
    """Lambert solution with sun safety only (no vehicle filter)."""
    departure = _normalize_epoch(departure)
    arrival = departure + timedelta(days=tof_days)
    tof_seconds = tof_days * 86400.0
    if tof_seconds <= 0:
        return None
    try:
        if ephem is not None:
            r1, v_orb1 = ephem.state_at(mission.origin, departure)
            r2, v_orb2 = ephem.state_at(mission.destination, arrival)
        else:
            r1, v_orb1 = get_state_at(mission.origin, departure)
            r2, v_orb2 = get_state_at(mission.destination, arrival)

        if np.linalg.norm(r1) < 1e6 or np.linalg.norm(r2) < 1e6:
            return None

        v1, v2 = izzo2015(SUN_MU, r1, r2, tof_seconds)

        if grid_sun_check_step_hours is not None and not is_solar_distance_safe(
            r1, v1, departure, arrival, step_hours=grid_sun_check_step_hours
        ):
            return None
        if preview_sun_check and not is_solar_distance_safe(
            r1, v1, departure, arrival, step_hours=168.0
        ):
            return None

        dv1 = float(np.linalg.norm(v1 - v_orb1))
        dv2 = float(np.linalg.norm(v2 - v_orb2))
        dv_total = dv1 + dv2

        return GridPoint(
            departure_epoch=departure,
            arrival_epoch=arrival,
            tof_days=tof_days,
            delta_v_total=dv_total,
            delta_v1=dv1,
            delta_v2=dv2,
            row=0,
            col=0,
        )
    except Exception:
        return None


def _compute_lambert_cell(
    mission: OrbitalMission,
    departure: datetime,
    tof_days: float,
) -> GridPoint | None:
    cell = _solve_lambert_cell(mission, departure, tof_days, preview_sun_check=True)
    if cell is None:
        return None
    vehicle = resolve_vehicle(mission.vehicle_id)
    if not is_transfer_feasible(vehicle, cell.delta_v_total, cell.delta_v1, cell.delta_v2):
        return None
    return cell


def _append_cell_to_row(
    cell: GridPoint | None,
    row_dv: list,
    row_dv1: list,
    row_dv2: list,
    row_tof: list,
) -> None:
    if cell:
        row_dv.append(cell.delta_v_total)
        row_dv1.append(cell.delta_v1)
        row_dv2.append(cell.delta_v2)
        row_tof.append(cell.tof_days)
    else:
        row_dv.append(None)
        row_dv1.append(None)
        row_dv2.append(None)
        row_tof.append(None)


def _tof_range(origin: BodyId, destination: BodyId, n_tof: int) -> np.ndarray:
    inner = {BodyId.MERCURY, BodyId.VENUS, BodyId.EARTH, BodyId.MARS, BodyId.MOON}
    if origin in inner and destination in inner:
        return np.linspace(30, 400, n_tof)
    return np.linspace(100, 2500, n_tof)


def compute_porkchop_grid(
    mission: OrbitalMission,
    n_departure: int | None = None,
    n_tof: int | None = None,
    progress_callback: ProgressCallback | None = None,
    mode_settings: ModeSettings | None = None,
) -> PorkchopResult:
    mission.validate()
    cfg = mode_settings or get_mode_settings("fast")
    n_departure = n_departure or cfg.n_departure
    n_tof = n_tof or cfg.n_tof
    start = _normalize_epoch(mission.departure_window_start)

    horizon_days = get_search_horizon_days(mission.origin, mission.destination)
    total_days = int(horizon_days)
    departure_dates = [
        start + timedelta(days=int(d)) for d in np.linspace(0, max(total_days, 1), n_departure)
    ]
    tof_days_list = _tof_range(mission.origin, mission.destination, n_tof).tolist()
    ephem = (
        _build_ephemeris_interpolator(mission, departure_dates, tof_days_list, cfg.ephem_step_days)
        if cfg.ephem_step_days
        else None
    )
    vehicle = resolve_vehicle(mission.vehicle_id)

    dv_matrix: list[list[float | None]] = []
    dv1_matrix: list[list[float | None]] = []
    dv2_matrix: list[list[float | None]] = []
    tof_matrix: list[list[float | None]] = []
    physics_dv_matrix: list[list[float | None]] = []
    physics_dv1_matrix: list[list[float | None]] = []
    physics_dv2_matrix: list[list[float | None]] = []
    physics_tof_matrix: list[list[float | None]] = []
    total = n_departure * n_tof
    done = 0

    for i, dep in enumerate(departure_dates):
        row_dv: list[float | None] = []
        row_dv1: list[float | None] = []
        row_dv2: list[float | None] = []
        row_tof: list[float | None] = []
        phys_dv: list[float | None] = []
        phys_dv1: list[float | None] = []
        phys_dv2: list[float | None] = []
        phys_tof: list[float | None] = []
        for j, tof in enumerate(tof_days_list):
            physics_cell = _solve_lambert_cell(
                mission,
                dep,
                float(tof),
                ephem,
                grid_sun_check_step_hours=cfg.grid_sun_check_step_hours,
            )
            if physics_cell:
                physics_cell.row = i
                physics_cell.col = j
            _append_cell_to_row(physics_cell, phys_dv, phys_dv1, phys_dv2, phys_tof)

            feasible_cell = None
            if physics_cell is not None and is_transfer_feasible(
                vehicle,
                physics_cell.delta_v_total,
                physics_cell.delta_v1,
                physics_cell.delta_v2,
            ):
                feasible_cell = physics_cell
            _append_cell_to_row(feasible_cell, row_dv, row_dv1, row_dv2, row_tof)

            done += 1
            if progress_callback and (done == 1 or done % 8 == 0 or done == total):
                pct = max(1, min(80, int(done / total * 80)))
                progress_callback(pct, done, total)
        dv_matrix.append(row_dv)
        dv1_matrix.append(row_dv1)
        dv2_matrix.append(row_dv2)
        tof_matrix.append(row_tof)
        physics_dv_matrix.append(phys_dv)
        physics_dv1_matrix.append(phys_dv1)
        physics_dv2_matrix.append(phys_dv2)
        physics_tof_matrix.append(phys_tof)

    total_cells = n_departure * n_tof
    feasible_cells = sum(1 for row in dv_matrix for v in row if v is not None)
    use_physics_fallback = feasible_cells == 0 and any(
        v is not None for row in physics_dv_matrix for v in row
    )

    optima_dv = physics_dv_matrix if use_physics_fallback else dv_matrix
    optima_dv1 = physics_dv1_matrix if use_physics_fallback else dv1_matrix
    optima_dv2 = physics_dv2_matrix if use_physics_fallback else dv2_matrix
    optima_tof = physics_tof_matrix if use_physics_fallback else tof_matrix

    fastest, cheapest, balanced = find_optima(
        departure_dates,
        tof_days_list,
        optima_dv,
        optima_tof,
        mission.weights,
        reference_departure=start,
        dv1_matrix=optima_dv1,
        dv2_matrix=optima_dv2,
    )

    launch_window = analyze_launch_window(
        mission.origin,
        mission.destination,
        start,
        cheapest,
    )
    launch_window["reference_departure"] = start.isoformat()
    launch_window["search_horizon_days"] = horizon_days

    vehicle = resolve_vehicle(mission.vehicle_id)
    launch_window["vehicle"] = vehicle_limits_dict(vehicle)
    launch_window["feasible_cells_fraction"] = (
        feasible_cells / total_cells if total_cells else 0.0
    )
    launch_window["over_budget"] = use_physics_fallback
    if use_physics_fallback:
        launch_window["warning"] = (
            f"No transfers within {vehicle.name} delta-v limits "
            f"({vehicle.max_delta_v_total_m_s / 1000:.1f} km/s total). "
            f"Showing best physics-only trajectories (over budget)."
        )
    elif vehicle.id != VehicleId.NONE and feasible_cells == 0:
        launch_window["warning"] = (
            f"No Lambert transfers within {vehicle.name} delta-v limits "
            f"({vehicle.max_delta_v_total_m_s / 1000:.1f} km/s total) "
            f"for this route and search window."
        )

    return PorkchopResult(
        departure_epochs=[d.isoformat() for d in departure_dates],
        tof_days=tof_days_list,
        delta_v=dv_matrix,
        fastest=fastest,
        cheapest=cheapest,
        balanced=balanced,
        launch_window=launch_window,
    )


def compute_single_cell(
    mission: OrbitalMission,
    departure: datetime,
    tof_days: float,
) -> GridPoint | None:
    return _compute_lambert_cell(mission, departure, tof_days)


def compute_transfer_states(
    mission: OrbitalMission,
    solution: GridPoint,
    mode_settings: ModeSettings | None = None,
) -> list:
    """Full state vectors for a Lambert transfer."""
    if solution.tof_days <= 0:
        return []
    tof_seconds = solution.tof_days * 86400.0
    if tof_seconds <= 0:
        return []
    cfg = mode_settings or get_mode_settings("fast")
    r1, v_orb1 = get_state_at(mission.origin, solution.departure_epoch)
    r2, v_orb2 = get_state_at(mission.destination, solution.arrival_epoch)
    v1, v2 = izzo2015(SUN_MU, r1, r2, tof_seconds)

    step_hours = _adaptive_step_hours(
        solution.tof_days,
        r1,
        v1,
        solution.departure_epoch,
        solution.arrival_epoch,
        step_factor=cfg.trajectory_step_factor,
    )
    return sample_transfer_states(
        r1, v1, r2, v2,
        solution.departure_epoch,
        solution.arrival_epoch,
        step_hours=step_hours,
    )
