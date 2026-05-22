"""Multi-leg Lambert trajectory through gravity-assist waypoints."""

from datetime import datetime, timedelta, timezone

import numpy as np
from lamberthub import izzo2015

from app.core.types import BodyId
from app.engine.body_constants import BODY_SOI_RADIUS_M
from app.engine.ephemerides import SUN_MU, get_state_at, sample_transfer_states
from app.engine.flyby import v_inf_at_soi
from app.engine.mission import OrbitalMission, StateVector


def _leg_tof_fractions(n_legs: int) -> list[float]:
    if n_legs <= 0:
        return []
    base = 1.0 / n_legs
    fracs = [base] * n_legs
    fracs[-1] = 1.0 - sum(fracs[:-1])
    return fracs


def _sample_flyby_arc(
    r_body: np.ndarray,
    v_body: np.ndarray,
    v_inf_in: np.ndarray,
    v_inf_out: np.ndarray,
    body: BodyId,
    epoch: datetime,
    n_samples: int = 8,
) -> list[StateVector]:
    """Sample a coarse hyperbolic arc segment inside SOI for visualization."""
    soi_r = BODY_SOI_RADIUS_M.get(body, 1e9)
    states: list[StateVector] = []
    v_in = v_body + v_inf_in
    v_out = v_body + v_inf_out
    r_in = r_body - (v_inf_in / (np.linalg.norm(v_inf_in) + 1e-9)) * soi_r * 0.95
    r_out = r_body + (v_inf_out / (np.linalg.norm(v_inf_out) + 1e-9)) * soi_r * 0.95

    for i in range(n_samples + 1):
        alpha = i / n_samples
        r = r_in * (1 - alpha) + r_out * alpha
        v = v_in * (1 - alpha) + v_out * alpha
        t = epoch + timedelta(seconds=alpha * 3600.0)
        states.append(
            StateVector(
                epoch=t,
                x=float(r[0]), y=float(r[1]), z=float(r[2]),
                vx=float(v[0]), vy=float(v[1]), vz=float(v[2]),
            )
        )
    return states


def compute_multileg_states(
    mission: OrbitalMission,
    assist_route: list[BodyId],
    departure: datetime,
    arrival: datetime,
    tof_days: float,
) -> list[StateVector]:
    """Chain Lambert legs with SOI flyby segments for visualization."""
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=timezone.utc)
    if arrival.tzinfo is None:
        arrival = arrival.replace(tzinfo=timezone.utc)

    bodies = [mission.origin, *assist_route, mission.destination]
    n_legs = len(bodies) - 1
    if n_legs <= 0:
        return []

    if n_legs == 1:
        from app.engine.porkchop import compute_transfer_states
        from app.engine.mission import GridPoint

        gp = GridPoint(
            departure_epoch=departure,
            arrival_epoch=arrival,
            tof_days=tof_days,
            delta_v_total=0,
            delta_v1=0,
            delta_v2=0,
            row=0,
            col=0,
        )
        return compute_transfer_states(mission, gp)

    fracs = _leg_tof_fractions(n_legs)
    total_seconds = tof_days * 86400.0
    leg_ends: list[datetime] = []
    t = departure
    for frac in fracs[:-1]:
        leg_seconds = total_seconds * frac
        t = t + timedelta(seconds=leg_seconds)
        leg_ends.append(t)
    leg_ends.append(arrival)

    all_states: list[StateVector] = []
    leg_start = departure

    for leg_idx in range(n_legs):
        body_from = bodies[leg_idx]
        body_to = bodies[leg_idx + 1]
        leg_end = leg_ends[leg_idx]
        leg_tof_s = (leg_end - leg_start).total_seconds()
        if leg_tof_s <= 0:
            continue

        try:
            r1, v_orb1 = get_state_at(body_from, leg_start)
            r2, v_orb2 = get_state_at(body_to, leg_end)
            if np.linalg.norm(r1) < 1e6 or np.linalg.norm(r2) < 1e6:
                leg_start = leg_end
                continue
            v1, v2 = izzo2015(SUN_MU, r1, r2, leg_tof_s)
        except Exception:
            leg_start = leg_end
            continue

        leg_tof_days = leg_tof_s / 86400.0
        step_hours = 1.0 if leg_tof_days < 60 else (3.0 if leg_tof_days < 180 else 12.0)
        leg_states = sample_transfer_states(r1, v1, r2, v2, leg_start, leg_end, step_hours=step_hours)

        if all_states and leg_states:
            leg_states = leg_states[1:]

        all_states.extend(leg_states)

        if leg_idx < n_legs - 1 and assist_route:
            assist_body = bodies[leg_idx + 1]
            r_body, v_body = get_state_at(assist_body, leg_end)
            v_inf_in = v_inf_at_soi(r2, v2, r_body, v_body)
            _, v_orb_next = get_state_at(assist_body, leg_end)
            v_inf_out = v_inf_at_soi(r2, v_orb_next, r_body, v_body)
            flyby_states = _sample_flyby_arc(
                r_body, v_body, v_inf_in, v_inf_out, assist_body, leg_end
            )
            if flyby_states:
                if all_states:
                    flyby_states = flyby_states[1:]
                all_states.extend(flyby_states)

        leg_start = leg_end

    return all_states if all_states else []
