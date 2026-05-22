"""Gravity assist routing via patched-conics multileg Lambert."""

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
from lamberthub import izzo2015

from app.core.calculation_mode import ModeSettings, get_mode_settings
from app.core.types import BodyId
from app.engine.ephemerides import SUN_MU, get_state_at, is_solar_distance_safe
from app.engine.flyby import compute_flyby, v_inf_at_soi
from app.engine.leg_budget import check_mission_legs
from app.engine.mission import GridPoint, LegMetric, OrbitalMission, SOITransition, TrajectoryResult
from app.engine.porkchop import compute_single_cell

ASSIST_ROUTES: dict[tuple[BodyId, BodyId], list[list[BodyId]]] = {
    (BodyId.EARTH, BodyId.JUPITER): [[BodyId.VENUS], [BodyId.VENUS, BodyId.EARTH]],
    (BodyId.EARTH, BodyId.SATURN): [[BodyId.VENUS], [BodyId.VENUS, BodyId.EARTH, BodyId.JUPITER]],
    (BodyId.EARTH, BodyId.NEPTUNE): [[BodyId.JUPITER, BodyId.SATURN]],
    (BodyId.EARTH, BodyId.URANUS): [[BodyId.VENUS, BodyId.EARTH, BodyId.JUPITER]],
    (BodyId.EARTH, BodyId.MARS): [[BodyId.VENUS]],
    (BodyId.MARS, BodyId.JUPITER): [[BodyId.EARTH]],
}


@dataclass
class RouteSolution:
    grid_point: GridPoint
    assist_route: list[BodyId]
    leg_metrics: list[LegMetric]
    soi_transitions: list[SOITransition]
    flyby_epochs: list[datetime]


def get_assist_candidates(origin: BodyId, destination: BodyId) -> list[list[BodyId]]:
    key = (origin, destination)
    rev = (destination, origin)
    return ASSIST_ROUTES.get(key, ASSIST_ROUTES.get(rev, []))


def _leg_tof_fractions(n_legs: int) -> list[float]:
    if n_legs <= 0:
        return []
    base = 1.0 / n_legs
    fracs = [base] * n_legs
    fracs[-1] = 1.0 - sum(fracs[:-1])
    return fracs


def _ga_departure_offsets(cfg: ModeSettings) -> list[float]:
    if cfg.ga_departure_offset_step_days is None:
        return [-90.0, -45.0, 0.0, 45.0, 90.0]
    step = cfg.ga_departure_offset_step_days
    window = cfg.ga_departure_window_days
    n = int(window / step)
    return [i * step for i in range(-n, n + 1)]


def _ga_tof_multipliers(cfg: ModeSettings, has_assist: bool) -> list[float]:
    if not has_assist:
        return [1.0]
    if cfg.ga_tof_multiplier_step is None:
        return [1.0, 1.05, 1.1, 1.15]
    mults: list[float] = []
    m = 1.0
    while m <= cfg.ga_tof_multiplier_max + 1e-9:
        mults.append(round(m, 4))
        m += cfg.ga_tof_multiplier_step
    return mults


def _ga_leg_tof_fraction_variants(n_legs: int, steps: int) -> list[list[float]]:
    if n_legs <= 0:
        return []
    if steps <= 1:
        return [_leg_tof_fractions(n_legs)]
    variants: list[list[float]] = []
    for i in range(steps):
        first = (i + 1) / (steps + 1)
        if n_legs == 1:
            variants.append([1.0])
        elif n_legs == 2:
            variants.append([first, 1.0 - first])
        else:
            remainder = 1.0 - first
            per = remainder / (n_legs - 1)
            fracs = [first] + [per] * (n_legs - 1)
            fracs[-1] = 1.0 - sum(fracs[:-1])
            variants.append(fracs)
    return variants


def _compute_direct_solution(
    mission: OrbitalMission,
    departure: datetime,
    tof_days: float,
) -> RouteSolution | None:
    cell = compute_single_cell(mission, departure, tof_days)
    if cell is None:
        return None
    leg = LegMetric(
        from_body=mission.origin,
        to_body=mission.destination,
        dv_departure=cell.delta_v1,
        dv_arrival=cell.delta_v2,
    )
    budget = check_mission_legs(mission.vehicle_id, [leg])
    if not budget.feasible:
        return None
    transitions = [
        SOITransition(epoch=cell.departure_epoch, from_body=mission.origin, to_body=BodyId.SUN),
        SOITransition(epoch=cell.arrival_epoch, from_body=BodyId.SUN, to_body=mission.destination),
    ]
    return RouteSolution(cell, [], [leg], transitions, [])


def _compute_multileg_solution(
    mission: OrbitalMission,
    assist_route: list[BodyId],
    departure: datetime,
    tof_days: float,
    tof_fractions: list[float] | None = None,
) -> RouteSolution | None:
    bodies = [mission.origin, *assist_route, mission.destination]
    n_legs = len(bodies) - 1
    if n_legs <= 0:
        return None

    fracs = tof_fractions or _leg_tof_fractions(n_legs)
    if len(fracs) != n_legs:
        return None

    total_seconds = tof_days * 86400.0
    leg_starts: list[datetime] = []
    leg_ends: list[datetime] = []
    t = departure
    leg_starts.append(t)
    for frac in fracs:
        leg_seconds = total_seconds * frac
        t = t + timedelta(seconds=leg_seconds)
        leg_ends.append(t)
        if len(leg_ends) < n_legs:
            leg_starts.append(t)

    leg_metrics: list[LegMetric] = []
    transitions: list[SOITransition] = []
    flyby_epochs: list[datetime] = []
    total_dv = 0.0
    prev_v_inf_out: np.ndarray | None = None

    transitions.append(
        SOITransition(epoch=departure, from_body=mission.origin, to_body=BodyId.SUN)
    )

    for leg_idx in range(n_legs):
        body_from = bodies[leg_idx]
        body_to = bodies[leg_idx + 1]
        leg_start = leg_starts[leg_idx]
        leg_end = leg_ends[leg_idx]
        leg_tof_s = (leg_end - leg_start).total_seconds()
        if leg_tof_s <= 0:
            return None

        try:
            r1, v_orb1 = get_state_at(body_from, leg_start)
            r2, v_orb2 = get_state_at(body_to, leg_end)
            if np.linalg.norm(r1) < 1e6 or np.linalg.norm(r2) < 1e6:
                return None
            v1, v2 = izzo2015(SUN_MU, r1, r2, leg_tof_s)
            if not is_solar_distance_safe(r1, v1, leg_start, leg_end):
                return None
        except Exception:
            return None

        dv_dep = float(np.linalg.norm(v1 - v_orb1))
        dv_arr = float(np.linalg.norm(v2 - v_orb2))

        if leg_idx > 0 and prev_v_inf_out is not None:
            r_body, v_body = get_state_at(body_from, leg_start)
            v_inf_in = v_inf_at_soi(r1, v1, r_body, v_body)
            v_inf_out = v_inf_at_soi(r1, v_orb1, r_body, v_body)
            flyby = compute_flyby(v_inf_in, v_inf_out, body_from, powered=True)
            if not flyby.feasible:
                return None
            dv_dep = max(dv_dep, flyby.delta_v_m_s)
            flyby_epochs.append(leg_start)
            transitions.append(
                SOITransition(epoch=leg_start, from_body=BodyId.SUN, to_body=body_from)
            )
            transitions.append(
                SOITransition(epoch=leg_start, from_body=body_from, to_body=BodyId.SUN)
            )

        leg_metrics.append(
            LegMetric(
                from_body=body_from,
                to_body=body_to,
                dv_departure=dv_dep,
                dv_arrival=dv_arr if leg_idx == n_legs - 1 else 0.0,
            )
        )
        total_dv += dv_dep + (dv_arr if leg_idx == n_legs - 1 else 0.0)

        if leg_idx < n_legs - 1:
            r_body_next, v_body_next = get_state_at(body_to, leg_end)
            prev_v_inf_out = v_inf_at_soi(r2, v2, r_body_next, v_body_next)
        else:
            prev_v_inf_out = None

    if leg_metrics:
        leg_metrics[-1].dv_arrival = float(np.linalg.norm(v2 - v_orb2))

    budget = check_mission_legs(mission.vehicle_id, leg_metrics)
    if not budget.feasible:
        return None

    arrival = leg_ends[-1]
    gp = GridPoint(
        departure_epoch=departure,
        arrival_epoch=arrival,
        tof_days=tof_days,
        delta_v_total=budget.total_dv,
        delta_v1=budget.departure_dv,
        delta_v2=budget.arrival_dv,
        row=0,
        col=0,
    )
    transitions.append(
        SOITransition(epoch=arrival, from_body=BodyId.SUN, to_body=mission.destination)
    )
    return RouteSolution(gp, assist_route, leg_metrics, transitions, flyby_epochs)


def search_route(
    mission: OrbitalMission,
    assist_route: list[BodyId],
    baseline: GridPoint,
    reference_departure: datetime | None = None,
    mode_settings: ModeSettings | None = None,
) -> RouteSolution | None:
    """Grid search over departure offsets for a fixed assist route."""
    cfg = mode_settings or get_mode_settings("fast")
    ref = reference_departure or mission.departure_window_start
    best: RouteSolution | None = None

    has_assist = bool(assist_route)
    tof_multipliers = _ga_tof_multipliers(cfg, has_assist)
    n_legs = len(assist_route) + 1 if has_assist else 1
    tof_fractions_list = _ga_leg_tof_fraction_variants(n_legs, cfg.ga_leg_tof_steps) if has_assist else [None]

    for offset_days in _ga_departure_offsets(cfg):
        dep = baseline.departure_epoch + timedelta(days=offset_days)
        if abs((dep - ref).total_seconds()) > cfg.ga_departure_window_days * 86400:
            continue
        for tof_mult in tof_multipliers:
            tof = baseline.tof_days * tof_mult
            for tof_fractions in tof_fractions_list:
                if assist_route:
                    sol = _compute_multileg_solution(
                        mission, assist_route, dep, tof, tof_fractions=tof_fractions
                    )
                else:
                    sol = _compute_direct_solution(mission, dep, tof)
                if sol and (best is None or sol.grid_point.delta_v_total < best.grid_point.delta_v_total):
                    best = sol
    return best


def try_gravity_assist_improvement(
    mission: OrbitalMission,
    baseline: GridPoint,
    reference_departure=None,
    mode_settings: ModeSettings | None = None,
) -> tuple[GridPoint | None, list[BodyId], list[SOITransition], list[LegMetric]]:
    """Search assist routes; return improved solution if delta-v gain > 5%."""
    if not mission.allow_gravity_assist:
        return None, [], [], []

    ref = reference_departure or mission.departure_window_start
    direct = search_route(mission, [], baseline, ref, mode_settings=mode_settings)
    direct_dv = direct.grid_point.delta_v_total if direct else baseline.delta_v_total

    candidates = get_assist_candidates(mission.origin, mission.destination)
    if mission.assist_bodies:
        candidates = [mission.assist_bodies]

    best: RouteSolution | None = direct
    for route in candidates:
        sol = search_route(mission, route, baseline, ref, mode_settings=mode_settings)
        if sol and (best is None or sol.grid_point.delta_v_total < best.grid_point.delta_v_total):
            best = sol

    if best is None or best.grid_point.delta_v_total >= direct_dv * 0.95:
        return None, [], [], []

    return best.grid_point, best.assist_route, best.soi_transitions, best.leg_metrics


def apply_assist_to_trajectory(
    result: TrajectoryResult,
    assist_bodies: list[BodyId],
    transitions: list[SOITransition],
    leg_metrics: list[LegMetric] | None = None,
) -> TrajectoryResult:
    result.assist_bodies = assist_bodies
    result.soi_transitions = transitions
    if leg_metrics:
        result.leg_metrics = leg_metrics
    return result
