"""Ramer-Douglas-Peucker polyline simplification."""

import numpy as np

from app.engine.mission import StateVector


def _perpendicular_distance(point: np.ndarray, start: np.ndarray, end: np.ndarray) -> float:
    if np.allclose(start, end):
        return float(np.linalg.norm(point - start))
    line = end - start
    return float(np.linalg.norm(np.cross(line, start - point)) / np.linalg.norm(line))


def rdp_simplify(states: list[StateVector], tolerance_m: float = 1e6) -> list[StateVector]:
    if len(states) <= 2:
        return states

    points = np.array([[s.x, s.y, s.z] for s in states])
    start, end = points[0], points[-1]
    distances = [_perpendicular_distance(points[i], start, end) for i in range(1, len(points) - 1)]

    if not distances:
        return states

    idx = int(np.argmax(distances)) + 1
    max_dist = distances[idx - 1]

    if max_dist > tolerance_m:
        left = rdp_simplify(states[: idx + 1], tolerance_m)
        right = rdp_simplify(states[idx:], tolerance_m)
        return left[:-1] + right
    return [states[0], states[-1]]


def _uniform_subsample(states: list[StateVector], target_count: int) -> list[StateVector]:
    if len(states) <= target_count:
        return states
    indices = np.linspace(0, len(states) - 1, target_count, dtype=int)
    return [states[i] for i in indices]


def simplify_trajectory(
    states: list[StateVector],
    tolerance_m: float = 1e6,
    preserve_indices: set[int] | None = None,
    min_points: int = 32,
) -> list[StateVector]:
    if len(states) <= 3:
        return states

    simplified = rdp_simplify(states, tolerance_m)
    if preserve_indices:
        preserved = [states[i] for i in sorted(preserve_indices) if i < len(states)]
        combined = {s.epoch: s for s in simplified + preserved}
        simplified = sorted(combined.values(), key=lambda s: s.epoch)

    if len(simplified) < min_points:
        return _uniform_subsample(states, min(min_points, len(states)))
    return simplified
