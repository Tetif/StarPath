"""Astropy + lamberthub trajectory engine (Poliastro-compatible API)."""

from app.core.calculation_mode import ModeSettings, get_mode_settings
from app.core.types import BodyId, TrajectoryKind
from app.engine.base import TrajectoryEngine
from app.engine.gravity_assist import apply_assist_to_trajectory, try_gravity_assist_improvement
from app.engine.mission import (
    GridPoint,
    LegMetric,
    OrbitalMission,
    PorkchopResult,
    SOITransition,
    TrajectoryResult,
)
from app.engine.multileg import compute_multileg_states
from app.engine.porkchop import compute_porkchop_grid, compute_single_cell, compute_transfer_states


class PoliastroEngine(TrajectoryEngine):
    def compute_porkchop(
        self,
        mission: OrbitalMission,
        progress_callback=None,
        mode_settings: ModeSettings | None = None,
    ) -> PorkchopResult:
        cfg = mode_settings or get_mode_settings("fast")
        result = compute_porkchop_grid(mission, progress_callback=progress_callback, mode_settings=cfg)

        if cfg.run_ga_on_porkchop and mission.allow_gravity_assist:
            ref = mission.departure_window_start
            improved, _, _, _ = try_gravity_assist_improvement(
                mission, result.cheapest, reference_departure=ref, mode_settings=cfg
            )
            if improved:
                result.cheapest = improved
            improved_bal, _, _, _ = try_gravity_assist_improvement(
                mission, result.balanced, reference_departure=ref, mode_settings=cfg
            )
            if improved_bal:
                result.balanced = improved_bal

        return result

    def compute_trajectory(
        self,
        mission: OrbitalMission,
        solution: GridPoint,
        kind: str,
        assist_bodies: list | None = None,
        mode_settings: ModeSettings | None = None,
    ) -> TrajectoryResult:
        mission.validate()
        ref = mission.departure_window_start

        soi_transitions = [
            SOITransition(
                epoch=solution.departure_epoch,
                from_body=mission.origin,
                to_body=BodyId.SUN,
            ),
            SOITransition(
                epoch=solution.arrival_epoch,
                from_body=BodyId.SUN,
                to_body=mission.destination,
            ),
        ]

        assist_route: list[BodyId] = list(assist_bodies or [])
        leg_metrics: list[LegMetric] = [
            LegMetric(
                from_body=mission.origin,
                to_body=mission.destination,
                dv_departure=solution.delta_v1,
                dv_arrival=solution.delta_v2,
            )
        ]
        cfg = mode_settings or get_mode_settings("fast")
        states = compute_transfer_states(mission, solution, mode_settings=cfg)

        result = TrajectoryResult(
            kind=TrajectoryKind(kind),
            grid_point=solution,
            states=states,
            soi_transitions=soi_transitions,
            assist_bodies=assist_route,
            leg_metrics=leg_metrics,
        )

        if mission.allow_gravity_assist and kind in ("cheapest", "balanced"):
            improved, route, transitions, legs = try_gravity_assist_improvement(
                mission, solution, reference_departure=ref, mode_settings=cfg
            )
            if improved and route:
                result = apply_assist_to_trajectory(result, route, transitions, legs)
                result.grid_point = improved
                result.states = compute_multileg_states(
                    mission, route, improved.departure_epoch, improved.arrival_epoch, improved.tof_days
                )
                if not result.states:
                    result.states = compute_transfer_states(mission, improved, mode_settings=cfg)
            elif improved:
                result.grid_point = improved
                result.leg_metrics = legs if legs else result.leg_metrics

        return result

    def compute_preview(self, mission: OrbitalMission, departure_epoch, tof_days: float) -> GridPoint:
        cell = compute_single_cell(mission, departure_epoch, tof_days)
        if cell is None:
            raise ValueError("No Lambert solution for preview parameters")
        return cell


engine = PoliastroEngine()
