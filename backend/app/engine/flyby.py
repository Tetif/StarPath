"""Patched-conics flyby mechanics."""

from dataclasses import dataclass

import numpy as np

from app.core.types import BodyId
from app.engine.body_constants import (
    BODY_MU_M3_S2,
    BODY_RADIUS_M,
    BODY_SOI_RADIUS_M,
    MIN_FLYBY_ALTITUDE_M,
)


@dataclass
class FlybyResult:
    v_inf_in: np.ndarray
    v_inf_out: np.ndarray
    turn_angle_rad: float
    periapsis_radius_m: float
    delta_v_m_s: float
    feasible: bool


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n < 1e-9:
        return v.copy()
    return v / n


def compute_turn_angle(v_inf_in: np.ndarray, v_inf_out: np.ndarray) -> float:
    """Turn angle between incoming and outgoing v-infinity vectors (rad)."""
    vi = _unit(v_inf_in)
    vo = _unit(v_inf_out)
    cos_delta = float(np.clip(np.dot(vi, vo), -1.0, 1.0))
    return float(np.arccos(cos_delta))


def compute_periapsis_from_turn(v_inf: np.ndarray, mu: float, turn_angle_rad: float) -> float:
    """Periapsis radius for given v_inf magnitude and turn angle (unpowered flyby)."""
    v = float(np.linalg.norm(v_inf))
    if v < 1e-6 or turn_angle_rad < 1e-9:
        return float("inf")
    # r_p = mu / v^2 * (1 / sin(delta/2) - 1)
    half = turn_angle_rad / 2.0
    sin_half = max(np.sin(half), 1e-9)
    return mu / (v * v) * (1.0 / sin_half - 1.0)


def compute_v_inf_out(v_inf_in: np.ndarray, turn_angle_rad: float, plane_normal: np.ndarray) -> np.ndarray:
    """Rotate v_inf_in by turn_angle_rad around plane_normal (Rodrigues)."""
    vi = _unit(v_inf_in)
    v_mag = float(np.linalg.norm(v_inf_in))
    n = _unit(plane_normal)
    if np.linalg.norm(n) < 1e-9:
        return vi * v_mag

    cos_t = np.cos(turn_angle_rad)
    sin_t = np.sin(turn_angle_rad)
    rotated = (
        vi * cos_t
        + np.cross(n, vi) * sin_t
        + n * np.dot(n, vi) * (1.0 - cos_t)
    )
    return rotated * v_mag


def compute_flyby(
    v_inf_in: np.ndarray,
    v_inf_out_desired: np.ndarray,
    body: BodyId,
    powered: bool = False,
) -> FlybyResult:
    """
    Match incoming/outgoing v_inf via unpowered (or minimal powered) flyby.
    Returns feasibility based on periapsis altitude.
    """
    mu = BODY_MU_M3_S2.get(body)
    r_body = BODY_RADIUS_M.get(body, 0.0)
    if mu is None:
        return FlybyResult(
            v_inf_in=v_inf_in,
            v_inf_out=v_inf_out_desired,
            turn_angle_rad=0.0,
            periapsis_radius_m=float("inf"),
            delta_v_m_s=float("inf"),
            feasible=False,
        )

    turn = compute_turn_angle(v_inf_in, v_inf_out_desired)
    r_p = compute_periapsis_from_turn(v_inf_in, mu, turn)
    min_r_p = r_body + MIN_FLYBY_ALTITUDE_M
    feasible = r_p >= min_r_p

    delta_v = 0.0
    v_out = v_inf_out_desired.copy()
    if not feasible and powered:
        # Minimal powered flyby: rotate in plane of v_inf_in and v_inf_out_desired
        plane_n = np.cross(v_inf_in, v_inf_out_desired)
        if np.linalg.norm(plane_n) > 1e-9:
            v_out = compute_v_inf_out(v_inf_in, turn, plane_n)
            delta_v = float(np.linalg.norm(v_out - v_inf_in))
            r_p = compute_periapsis_from_turn(v_inf_in, mu, turn)
            feasible = r_p >= min_r_p and delta_v < 500.0

    return FlybyResult(
        v_inf_in=v_inf_in.copy(),
        v_inf_out=v_out,
        turn_angle_rad=turn,
        periapsis_radius_m=r_p,
        delta_v_m_s=delta_v,
        feasible=feasible,
    )


def v_inf_at_soi(
    r_craft: np.ndarray,
    v_craft: np.ndarray,
    r_body: np.ndarray,
    v_body: np.ndarray,
) -> np.ndarray:
    """Hyperbolic excess velocity relative to body at SOI crossing."""
    return v_craft - v_body


def soi_boundary_state(
    r_body: np.ndarray,
    v_body: np.ndarray,
    v_inf: np.ndarray,
    body: BodyId,
    incoming: bool = True,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Approximate heliocentric position/velocity at SOI boundary along v_inf direction.
    incoming=True: craft approaching body; False: departing.
    """
    soi_r = BODY_SOI_RADIUS_M.get(body, 1e9)
    direction = _unit(v_inf)
    if incoming:
        r_craft = r_body - direction * soi_r
    else:
        r_craft = r_body + direction * soi_r
    v_craft = v_body + v_inf
    return r_craft, v_craft
