"""Celery calculation tasks."""

from datetime import datetime, timedelta
from pathlib import Path

from app.cache.redis_cache import cache, porkchop_cache_key, trajectory_cache_key
from app.core.calculation_mode import get_mode_settings, parse_calculation_mode
from app.core.config import settings
from app.core.types import BodyId, TrajectoryKind
from app.czml.builder import save_single_czml
from app.engine.launch_windows import get_search_horizon_days
from app.engine.mission import GridPoint, LegMetric, OrbitalMission, PorkchopResult, SOITransition, StateVector, TrajectoryResult
from app.engine.poliastro_engine import engine
from app.tasks.celery_app import celery_app


def _grid_point_to_dict(gp: GridPoint) -> dict:
    return {
        "departure_epoch": gp.departure_epoch.isoformat(),
        "arrival_epoch": gp.arrival_epoch.isoformat(),
        "tof_days": gp.tof_days,
        "delta_v_total": gp.delta_v_total,
        "delta_v1": gp.delta_v1,
        "delta_v2": gp.delta_v2,
        "row": gp.row,
        "col": gp.col,
    }


def _leg_metric_to_dict(leg: LegMetric) -> dict:
    return {
        "from_body": leg.from_body.value if hasattr(leg.from_body, "value") else str(leg.from_body),
        "to_body": leg.to_body.value if hasattr(leg.to_body, "value") else str(leg.to_body),
        "dv_departure": leg.dv_departure,
        "dv_arrival": leg.dv_arrival,
    }


def _state_to_dict(s: StateVector) -> dict:
    return {
        "epoch": s.epoch.isoformat(),
        "x": s.x, "y": s.y, "z": s.z,
        "vx": s.vx, "vy": s.vy, "vz": s.vz,
    }


def _dict_to_state(data: dict) -> StateVector:
    return StateVector(
        epoch=datetime.fromisoformat(data["epoch"]),
        x=data["x"], y=data["y"], z=data["z"],
        vx=data["vx"], vy=data["vy"], vz=data["vz"],
    )


def _dict_to_leg_metric(data: dict) -> LegMetric:
    return LegMetric(
        from_body=BodyId(data["from_body"]),
        to_body=BodyId(data["to_body"]),
        dv_departure=data["dv_departure"],
        dv_arrival=data["dv_arrival"],
    )


def _trajectory_to_cache(traj: TrajectoryResult) -> dict:
    return {
        "metrics": _grid_point_to_dict(traj.grid_point),
        "soi_transitions": [
            {
                "epoch": t.epoch.isoformat(),
                "from_body": t.from_body.value if hasattr(t.from_body, "value") else str(t.from_body),
                "to_body": t.to_body.value if hasattr(t.to_body, "value") else str(t.to_body),
            }
            for t in traj.soi_transitions
        ],
        "assist_bodies": [
            b.value if hasattr(b, "value") else str(b) for b in traj.assist_bodies
        ],
        "leg_metrics": [_leg_metric_to_dict(leg) for leg in traj.leg_metrics],
        "states": [_state_to_dict(s) for s in traj.states],
        "kind": traj.kind.value,
    }


def _cache_to_trajectory(cached: dict) -> TrajectoryResult:
    gp = _dict_to_grid_point(cached["metrics"])
    transitions = [
        SOITransition(
            epoch=datetime.fromisoformat(t["epoch"]),
            from_body=BodyId(t["from_body"]),
            to_body=BodyId(t["to_body"]),
        )
        for t in cached.get("soi_transitions", [])
    ]
    leg_metrics = [_dict_to_leg_metric(leg) for leg in cached.get("leg_metrics", [])]
    states = [_dict_to_state(s) for s in cached.get("states", [])]
    assist = [BodyId(b) for b in cached.get("assist_bodies", [])]
    return TrajectoryResult(
        kind=TrajectoryKind(cached.get("kind", "balanced")),
        grid_point=gp,
        states=states,
        soi_transitions=transitions,
        assist_bodies=assist,
        leg_metrics=leg_metrics,
    )


def _trajectory_to_response(traj: TrajectoryResult, task_id: str, kind: str) -> dict:
    return {
        "metrics": _grid_point_to_dict(traj.grid_point),
        "czml_url": f"/api/v1/czml/{task_id}/{kind}",
        "soi_transitions": [
            {
                "epoch": t.epoch.isoformat(),
                "from_body": t.from_body.value if hasattr(t.from_body, "value") else str(t.from_body),
                "to_body": t.to_body.value if hasattr(t.to_body, "value") else str(t.to_body),
            }
            for t in traj.soi_transitions
        ],
        "assist_bodies": [
            b.value if hasattr(b, "value") else str(b) for b in traj.assist_bodies
        ],
        "leg_metrics": [_leg_metric_to_dict(leg) for leg in traj.leg_metrics],
    }


def _porkchop_to_dict(result: PorkchopResult) -> dict:
    return {
        "departure_epochs": result.departure_epochs,
        "tof_days": result.tof_days,
        "delta_v": result.delta_v,
        "fastest": _grid_point_to_dict(result.fastest),
        "cheapest": _grid_point_to_dict(result.cheapest),
        "balanced": _grid_point_to_dict(result.balanced),
        "launch_window": result.launch_window,
    }


def _dict_to_grid_point(data: dict) -> GridPoint:
    return GridPoint(
        departure_epoch=datetime.fromisoformat(data["departure_epoch"]),
        arrival_epoch=datetime.fromisoformat(data["arrival_epoch"]),
        tof_days=data["tof_days"],
        delta_v_total=data["delta_v_total"],
        delta_v1=data["delta_v1"],
        delta_v2=data["delta_v2"],
        row=data.get("row", 0),
        col=data.get("col", 0),
    )


@celery_app.task(bind=True, name="app.tasks.calculate.run_mission_calculation")
def run_mission_calculation(self, mission_data: dict) -> dict:
    self.update_state(
        state="PROGRESS",
        meta={"progress": 1, "stage": "Loading ephemerides..."},
    )

    from app.engine.ephemerides import get_state_at

    get_state_at(BodyId.EARTH, datetime.fromisoformat(mission_data["departure_from"].replace("Z", "+00:00")))

    departure_from = datetime.fromisoformat(mission_data["departure_from"].replace("Z", "+00:00"))
    origin = BodyId(mission_data["origin"])
    destination = BodyId(mission_data["destination"])
    horizon_days = get_search_horizon_days(origin, destination)

    if mission_data.get("departure_to"):
        departure_to = datetime.fromisoformat(mission_data["departure_to"].replace("Z", "+00:00"))
        window_end = departure_to
    else:
        window_end = departure_from + timedelta(days=horizon_days)

    mission = OrbitalMission(
        origin=origin,
        destination=destination,
        departure_window_start=departure_from,
        departure_window_end=window_end,
        allow_gravity_assist=mission_data.get("allow_gravity_assist", False),
        use_barycenter=mission_data.get("use_barycenter", False),
        weights=mission_data.get("weights", {"time": 0.5, "delta_v": 0.5}),
        vehicle_id=mission_data.get("vehicle_id", "starship"),
    )
    mission.validate()

    calc_mode = parse_calculation_mode(mission_data.get("calculation_mode"))
    mode_cfg = get_mode_settings(calc_mode)

    cache_key = porkchop_cache_key(
        mission.origin.value,
        mission.destination.value,
        mission_data["departure_from"],
        mission.vehicle_id or "none",
        mission.allow_gravity_assist,
        mission.weights,
        calc_mode.value,
    )
    cached = cache.get(cache_key)
    if cached:
        self.update_state(
            state="PROGRESS",
            meta={"progress": 80, "stage": "Using cached porkchop grid..."},
        )
        porkchop = cached
    else:
        mode_label = "accurate" if calc_mode.value == "accurate" else "fast"

        def progress(pct: int, done: int = 0, total: int = 0):
            stage = f"Computing porkchop grid ({mode_label})..."
            if total > 0:
                stage = f"Computing porkchop grid ({mode_label}, {done}/{total})..."
            self.update_state(
                state="PROGRESS",
                meta={"progress": pct, "stage": stage},
            )

        result = engine.compute_porkchop(
            mission, progress_callback=progress, mode_settings=mode_cfg
        )
        porkchop = _porkchop_to_dict(result)
        cache.set(cache_key, porkchop, settings.porkchop_cache_ttl)

    trajectories = {}
    czml_dir = Path(settings.czml_storage_dir)
    czml_dir.mkdir(parents=True, exist_ok=True)

    for i, kind in enumerate(("fastest", "cheapest", "balanced")):
        self.update_state(
            state="PROGRESS",
            meta={"progress": 85 + i * 5, "stage": f"Building {kind} trajectory..."},
        )
        gp_data = porkchop[kind]
        gp = _dict_to_grid_point(gp_data)

        traj_key = trajectory_cache_key(
            mission.origin.value,
            mission.destination.value,
            gp.departure_epoch.isoformat(),
            gp.tof_days,
            kind,
            mission.vehicle_id or "none",
            mission.allow_gravity_assist,
            None,
            calc_mode.value,
        )
        traj_cached = cache.get(traj_key)
        if traj_cached:
            traj = _cache_to_trajectory(traj_cached)
            self.update_state(
                state="PROGRESS",
                meta={"progress": 85 + i * 5, "stage": f"Using cached {kind} trajectory..."},
            )
        else:
            if mission.allow_gravity_assist and kind in ("cheapest", "balanced"):
                self.update_state(
                    state="PROGRESS",
                    meta={"progress": 85 + i * 5, "stage": f"Gravity assist ({kind})..."},
                )
            traj = engine.compute_trajectory(mission, gp, kind, mode_settings=mode_cfg)
            cache.set(traj_key, _trajectory_to_cache(traj), settings.trajectory_cache_ttl)
        if len(traj.states) < 2:
            raise ValueError(f"Trajectory {kind} produced no geometry for export")

        czml_path = czml_dir / f"{self.request.id}_{kind}.czml"
        save_single_czml(traj, czml_path, mode_settings=mode_cfg)
        trajectories[kind] = _trajectory_to_response(traj, self.request.id, kind)

    self.update_state(
        state="PROGRESS",
        meta={"progress": 100, "stage": "Done"},
    )

    return {
        "porkchop": {
            "departure_epochs": porkchop["departure_epochs"],
            "tof_days": porkchop["tof_days"],
            "delta_v": porkchop["delta_v"],
        },
        "launch_window": porkchop["launch_window"],
        "trajectories": trajectories,
    }
