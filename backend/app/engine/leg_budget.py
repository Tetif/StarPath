"""Per-leg vehicle feasibility checks."""

from dataclasses import dataclass

from app.engine.mission import LegMetric
from app.engine.vehicle import VehicleId, VehicleProfile, resolve_vehicle


@dataclass
class LegBudgetResult:
    feasible: bool
    total_dv: float
    departure_dv: float
    arrival_dv: float
    reason: str | None = None


def check_leg_budget(
    profile: VehicleProfile,
    leg_metrics: list[LegMetric],
) -> LegBudgetResult:
    """Validate Starship limits across all legs."""
    if profile.id == VehicleId.NONE or not leg_metrics:
        total = sum(leg.dv_departure + leg.dv_arrival for leg in leg_metrics)
        dep = leg_metrics[0].dv_departure if leg_metrics else 0.0
        arr = leg_metrics[-1].dv_arrival if leg_metrics else 0.0
        return LegBudgetResult(True, total, dep, arr)

    total = 0.0
    for i, leg in enumerate(leg_metrics):
        leg_total = leg.dv_departure + leg.dv_arrival
        total += leg_total
        if i == 0 and leg.dv_departure > profile.max_delta_v_departure_m_s:
            return LegBudgetResult(
                False, total, leg.dv_departure, leg_metrics[-1].dv_arrival,
                f"Departure burn {leg.dv_departure / 1000:.2f} km/s exceeds limit",
            )
        if i == len(leg_metrics) - 1 and leg.dv_arrival > profile.max_delta_v_arrival_m_s:
            return LegBudgetResult(
                False, total, leg_metrics[0].dv_departure, leg.dv_arrival,
                f"Arrival burn {leg.dv_arrival / 1000:.2f} km/s exceeds limit",
            )
        if i > 0 and leg.dv_departure > profile.max_delta_v_departure_m_s:
            return LegBudgetResult(
                False, total, leg_metrics[0].dv_departure, leg_metrics[-1].dv_arrival,
                f"Intermediate burn {leg.dv_departure / 1000:.2f} km/s exceeds limit",
            )

    if total > profile.max_delta_v_total_m_s:
        return LegBudgetResult(
            False, total, leg_metrics[0].dv_departure, leg_metrics[-1].dv_arrival,
            f"Total Δv {total / 1000:.2f} km/s exceeds budget",
        )

    return LegBudgetResult(
        True, total, leg_metrics[0].dv_departure, leg_metrics[-1].dv_arrival
    )


def check_mission_legs(
    vehicle_id: str | None,
    leg_metrics: list[LegMetric],
) -> LegBudgetResult:
    profile = resolve_vehicle(vehicle_id)
    return check_leg_budget(profile, leg_metrics)
