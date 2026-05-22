"""Coordinate frame utilities — all transforms explicit."""

import numpy as np

from app.core.types import Frame


def state_to_icrs(position_m: np.ndarray, velocity_m_s: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return position/velocity arrays in ICRS (J2000) meters and m/s."""
    return position_m.astype(float), velocity_m_s.astype(float)


def icrs_to_cesium_cartesian(position_m: np.ndarray) -> tuple[float, float, float]:
    """ICRS J2000 meters to Cesium Cartesian3-compatible tuple."""
    return float(position_m[0]), float(position_m[1]), float(position_m[2])


def get_reference_frame_name(frame: Frame) -> str:
    mapping = {
        Frame.J2000: "INERTIAL",
        Frame.EARTH_ECLIPTIC: "INERTIAL",
        Frame.BARYCENTER: "INERTIAL",
    }
    return mapping.get(frame, "INERTIAL")


def frame_metadata(frame: Frame) -> dict:
    return {"frame": frame.value, "reference": get_reference_frame_name(frame)}
