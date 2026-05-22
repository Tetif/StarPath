"""Spacecraft vehicle profiles and delta-v feasibility limits."""

from dataclasses import dataclass
from enum import StrEnum
import math


class VehicleId(StrEnum):
    NONE = "none"
    STARSHIP = "starship"


@dataclass(frozen=True)
class VehicleProfile:
    id: VehicleId
    name: str
    description: str
    max_delta_v_total_m_s: float
    max_delta_v_departure_m_s: float
    max_delta_v_arrival_m_s: float
    dry_mass_kg: float | None = None
    propellant_mass_kg: float | None = None
    payload_mass_kg: float | None = None
    isp_vacuum_s: float | None = None

    @property
    def theoretical_max_delta_v_m_s(self) -> float | None:
        """Tsiolkovsky Δv for ship-only mass ratio (no payload, vacuum)."""
        if self.isp_vacuum_s is None or self.dry_mass_kg is None or self.propellant_mass_kg is None:
            return None
        m0 = self.dry_mass_kg + self.propellant_mass_kg
        return self.isp_vacuum_s * 9.80665 * math.log(m0 / self.dry_mass_kg)


# Approximate Starship parameters (public SpaceX / industry estimates):
# - Ship dry mass ~100 t, propellant ~1200 t, Raptor vacuum Isp ~380 s
# - Interplanetary budget assumes LEO refueling before TMI; reserves for capture
STARSHIP = VehicleProfile(
    id=VehicleId.STARSHIP,
    name="Starship",
    description=(
        "SpaceX Starship with LEO refuel: ~6 km/s deep-space budget, "
        "~4.2 km/s departure (TMI), ~2.2 km/s arrival (capture)."
    ),
    max_delta_v_total_m_s=6_000.0,
    max_delta_v_departure_m_s=4_200.0,
    max_delta_v_arrival_m_s=2_200.0,
    dry_mass_kg=100_000.0,
    propellant_mass_kg=1_200_000.0,
    payload_mass_kg=100_000.0,
    isp_vacuum_s=380.0,
)

UNLIMITED = VehicleProfile(
    id=VehicleId.NONE,
    name="Unlimited",
    description="No vehicle delta-v limits (patched-conics Lambert only).",
    max_delta_v_total_m_s=float("inf"),
    max_delta_v_departure_m_s=float("inf"),
    max_delta_v_arrival_m_s=float("inf"),
)

VEHICLE_PROFILES: dict[VehicleId, VehicleProfile] = {
    VehicleId.NONE: UNLIMITED,
    VehicleId.STARSHIP: STARSHIP,
}


def resolve_vehicle(vehicle_id: str | VehicleId | None) -> VehicleProfile:
    if vehicle_id is None or vehicle_id == "" or vehicle_id == VehicleId.NONE:
        return UNLIMITED
    vid = VehicleId(vehicle_id) if isinstance(vehicle_id, str) else vehicle_id
    profile = VEHICLE_PROFILES.get(vid)
    if profile is None:
        raise ValueError(f"Unknown vehicle: {vehicle_id}")
    return profile


def is_transfer_feasible(
    profile: VehicleProfile,
    delta_v_total: float,
    delta_v1: float,
    delta_v2: float,
) -> bool:
    if profile.id == VehicleId.NONE:
        return True
    return (
        delta_v_total <= profile.max_delta_v_total_m_s
        and delta_v1 <= profile.max_delta_v_departure_m_s
        and delta_v2 <= profile.max_delta_v_arrival_m_s
    )


def vehicle_limits_dict(profile: VehicleProfile) -> dict:
    return {
        "vehicle_id": profile.id.value,
        "vehicle_name": profile.name,
        "max_delta_v_total_km_s": profile.max_delta_v_total_m_s / 1000.0,
        "max_delta_v_departure_km_s": profile.max_delta_v_departure_m_s / 1000.0,
        "max_delta_v_arrival_km_s": profile.max_delta_v_arrival_m_s / 1000.0,
        "theoretical_max_delta_v_km_s": (
            profile.theoretical_max_delta_v_m_s / 1000.0
            if profile.theoretical_max_delta_v_m_s is not None
            else None
        ),
    }
