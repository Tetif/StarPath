"""Patched-conics flyby unit tests."""

import numpy as np

from app.core.types import BodyId
from app.engine.flyby import (
    compute_flyby,
    compute_periapsis_from_turn,
    compute_turn_angle,
    compute_v_inf_out,
)


def test_flyby_turn_angle():
    v_in = np.array([5000.0, 0.0, 0.0])
    v_out = np.array([0.0, 5000.0, 0.0])
    angle = compute_turn_angle(v_in, v_out)
    assert abs(angle - np.pi / 2) < 1e-6


def test_periapsis_decreases_with_larger_turn():
    v_inf = np.array([8000.0, 0.0, 0.0])
    mu = 3.24858592e14
    r_small = compute_periapsis_from_turn(v_inf, mu, np.radians(20))
    r_large = compute_periapsis_from_turn(v_inf, mu, np.radians(60))
    assert r_large < r_small


def test_v_inf_rotation_preserves_magnitude():
    v_in = np.array([6000.0, 2000.0, 0.0])
    n = np.array([0.0, 0.0, 1.0])
    v_out = compute_v_inf_out(v_in, np.radians(35), n)
    assert abs(np.linalg.norm(v_out) - np.linalg.norm(v_in)) < 1e-3


def test_venus_flyby_feasibility():
    v_in = np.array([8000.0, 1000.0, 0.0])
    v_out = np.array([7000.0, 3000.0, 0.0])
    result = compute_flyby(v_in, v_out, BodyId.VENUS, powered=False)
    assert result.turn_angle_rad > 0
    assert result.periapsis_radius_m > 0
