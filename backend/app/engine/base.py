from abc import ABC, abstractmethod

from app.engine.mission import OrbitalMission, PorkchopResult, TrajectoryResult, GridPoint


class TrajectoryEngine(ABC):
    @abstractmethod
    def compute_porkchop(self, mission: OrbitalMission, progress_callback=None) -> PorkchopResult:
        ...

    @abstractmethod
    def compute_trajectory(
        self,
        mission: OrbitalMission,
        solution: GridPoint,
        kind: str,
        assist_bodies: list | None = None,
    ) -> TrajectoryResult:
        ...

    @abstractmethod
    def compute_preview(
        self,
        mission: OrbitalMission,
        departure_epoch,
        tof_days: float,
    ) -> GridPoint:
        ...
