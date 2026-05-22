"""Body ephemeris helpers using Astropy."""

from datetime import datetime, timedelta, timezone

import numpy as np
from astropy import units as u
from astropy.coordinates import get_body_barycentric_posvel
from astropy.time import Time

from app.core.config import settings
from app.core.types import BodyId
from app.engine.mission import StateVector

# Standard gravitational parameter of the Sun (m^3/s^2)
SUN_MU = 1.32712440018e20

ASTROPY_BODIES = {
    BodyId.SUN: "sun",
    BodyId.MERCURY: "mercury",
    BodyId.VENUS: "venus",
    BodyId.EARTH: "earth",
    BodyId.MARS: "mars",
    BodyId.JUPITER: "jupiter",
    BodyId.SATURN: "saturn",
    BodyId.URANUS: "uranus",
    BodyId.NEPTUNE: "neptune",
    BodyId.MOON: "moon",
}


def epoch_to_time(epoch: datetime) -> Time:
    if epoch.tzinfo is None:
        epoch = epoch.replace(tzinfo=timezone.utc)
    return Time(epoch)


def get_state_at(body_id: BodyId, epoch: datetime) -> tuple[np.ndarray, np.ndarray]:
    """Heliocentric position (m) and velocity (m/s) in ICRS/J2000."""
    if body_id == BodyId.SUN:
        return np.zeros(3), np.zeros(3)

    name = ASTROPY_BODIES[body_id]
    t = epoch_to_time(epoch)
    pos, vel = get_body_barycentric_posvel(name, t)
    r = pos.xyz.to(u.m).value
    v = vel.xyz.to(u.m / u.s).value
    return np.array(r, dtype=float), np.array(v, dtype=float)


def _sun_gravity_accel(r: np.ndarray) -> np.ndarray:
    rmag = np.linalg.norm(r)
    if rmag < 1e6:
        return np.zeros(3, dtype=float)
    return -SUN_MU * r / rmag**3


def propagate_two_body(
    r0: np.ndarray,
    v0: np.ndarray,
    dt_seconds: float,
    step_seconds: float = 3600.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Keplerian two-body propagation under Sun gravity (RK4)."""
    if abs(dt_seconds) < 1e-9:
        return r0.copy().astype(float), v0.copy().astype(float)

    r = r0.copy().astype(float)
    v = v0.copy().astype(float)
    dt = float(dt_seconds)
    step = min(abs(step_seconds), abs(dt))
    n_steps = max(int(abs(dt) / step), 1)
    h = dt / n_steps

    for _ in range(n_steps):
        k1_r = v
        k1_v = _sun_gravity_accel(r)

        k2_r = v + 0.5 * h * k1_v
        k2_v = _sun_gravity_accel(r + 0.5 * h * k1_r)

        k3_r = v + 0.5 * h * k2_v
        k3_v = _sun_gravity_accel(r + 0.5 * h * k2_r)

        k4_r = v + h * k3_v
        k4_v = _sun_gravity_accel(r + h * k3_r)

        v = v + (h / 6.0) * (k1_v + 2.0 * k2_v + 2.0 * k3_v + k4_v)
        r = r + (h / 6.0) * (k1_r + 2.0 * k2_r + 2.0 * k3_r + k4_r)

    return r, v


def min_heliocentric_distance(
    r1: np.ndarray,
    v1: np.ndarray,
    start: datetime,
    end: datetime,
    step_hours: float = 12.0,
) -> float:
    """Minimum |r| along a two-body Sun arc (coarse sample for feasibility)."""
    total_seconds = (end - start).total_seconds()
    if total_seconds <= 0:
        return float(np.linalg.norm(r1))

    step_s = step_hours * 3600.0
    n_samples = max(int(total_seconds / step_s), 4)
    h = total_seconds / n_samples
    r = r1.copy().astype(float)
    v = v1.copy().astype(float)
    min_dist = float(np.linalg.norm(r))

    for _ in range(n_samples):
        r, v = propagate_two_body(r, v, h, step_seconds=min(h, 3600.0))
        min_dist = min(min_dist, float(np.linalg.norm(r)))
    return min_dist


def is_solar_distance_safe(
    r1: np.ndarray,
    v1: np.ndarray,
    start: datetime,
    end: datetime,
    min_distance_m: float | None = None,
    step_hours: float = 24.0,
) -> bool:
    """Reject transfers that pass too close to the Sun."""
    limit = min_distance_m if min_distance_m is not None else settings.min_solar_distance_m
    return min_heliocentric_distance(r1, v1, start, end, step_hours=step_hours) >= limit


def propagate_linear(
    r0: np.ndarray,
    v0: np.ndarray,
    dt_seconds: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Backward-compatible alias for two-body propagation."""
    return propagate_two_body(r0, v0, dt_seconds)


def sample_transfer_states(
    r1: np.ndarray,
    v1: np.ndarray,
    r2: np.ndarray,
    v2: np.ndarray,
    start: datetime,
    end: datetime,
    step_hours: float = 6.0,
) -> list[StateVector]:
    """Sample states along Lambert transfer arc via two-body propagation."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    total_seconds = (end - start).total_seconds()
    if total_seconds <= 0:
        return []

    step_s = step_hours * 3600.0
    integration_step = min(step_s, 3600.0)

    states: list[StateVector] = []
    r = r1.copy().astype(float)
    v = v1.copy().astype(float)
    t = 0.0

    states.append(
        StateVector(
            epoch=start,
            x=float(r[0]),
            y=float(r[1]),
            z=float(r[2]),
            vx=float(v[0]),
            vy=float(v[1]),
            vz=float(v[2]),
        )
    )

    while t + step_s < total_seconds:
        r, v = propagate_two_body(r, v, step_s, step_seconds=integration_step)
        t += step_s
        states.append(
            StateVector(
                epoch=start + timedelta(seconds=t),
                x=float(r[0]),
                y=float(r[1]),
                z=float(r[2]),
                vx=float(v[0]),
                vy=float(v[1]),
                vz=float(v[2]),
            )
        )

    remaining = total_seconds - t
    if remaining > 1.0:
        r, v = propagate_two_body(r, v, remaining, step_seconds=integration_step)

    drift = float(np.linalg.norm(r - r2))
    if drift > 1e6:
        states.append(
            StateVector(
                epoch=end,
                x=float(r[0]), y=float(r[1]), z=float(r[2]),
                vx=float(v[0]), vy=float(v[1]), vz=float(v[2]),
            )
        )
    else:
        states.append(
            StateVector(
                epoch=end,
                x=float(r2[0]), y=float(r2[1]), z=float(r2[2]),
                vx=float(v2[0]), vy=float(v2[1]), vz=float(v2[2]),
            )
        )
    return states
