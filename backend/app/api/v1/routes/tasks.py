from datetime import datetime
from pathlib import Path

from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.api.v1.schemas import (
    PorkchopSchema,
    PreviewResponse,
    TaskResponse,
    TaskResults,
    TrajectoryResultSchema,
)
from app.core.config import settings
from app.core.types import TaskStatus
from app.engine.mission import OrbitalMission
from app.engine.poliastro_engine import engine
from app.tasks.celery_app import celery_app

router = APIRouter(tags=["tasks"])


def _map_celery_status(state: str) -> TaskStatus:
    mapping = {
        "PENDING": TaskStatus.PENDING,
        "STARTED": TaskStatus.RUNNING,
        "PROGRESS": TaskStatus.RUNNING,
        "SUCCESS": TaskStatus.COMPLETED,
        "FAILURE": TaskStatus.FAILED,
    }
    return mapping.get(state, TaskStatus.PENDING)


def _read_task_meta(result: AsyncResult) -> tuple[int, str | None]:
    meta = result.info if isinstance(result.info, dict) else {}
    progress = meta.get("progress", 0)
    stage = meta.get("stage")
    if result.state == "STARTED" and progress == 0:
        progress = 1
        stage = stage or "Starting calculation..."
    return progress, stage


@router.get("/task/{task_id}", response_model=TaskResponse)
async def get_task_status(task_id: str):
    result = AsyncResult(task_id, app=celery_app)
    status = _map_celery_status(result.state)
    progress = 0
    stage = None
    error = None
    results = None

    if result.state == "PENDING":
        progress = 2
        stage = "Queued — waiting for Celery worker..."
    elif result.state in ("STARTED", "PROGRESS"):
        progress, stage = _read_task_meta(result)
    elif result.state == "SUCCESS":
        progress = 100
        data = result.result
        trajectories = {}
        for kind, traj in data.get("trajectories", {}).items():
            trajectories[kind] = TrajectoryResultSchema(**traj)
        results = TaskResults(
            launch_window=data.get("launch_window"),
            porkchop=PorkchopSchema(**data["porkchop"]) if data.get("porkchop") else None,
            trajectories=trajectories or None,
        )
    elif result.state == "FAILURE":
        error = str(result.info) if result.info else "Calculation failed"
        status = TaskStatus.FAILED

    return TaskResponse(status=status, progress=progress, stage=stage, error=error, results=results)


@router.get("/preview", response_model=PreviewResponse)
async def preview_trajectory(
    origin: str = Query(...),
    destination: str = Query(...),
    departure: datetime = Query(...),
    tof: float = Query(..., gt=0),
    vehicle_id: str = Query("starship"),
):
    try:
        mission = OrbitalMission(
            origin=origin,
            destination=destination,
            departure_window_start=departure,
            departure_window_end=departure,
            vehicle_id=vehicle_id,
        )
        cell = engine.compute_preview(mission, departure, tof)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return PreviewResponse(
        departure_epoch=cell.departure_epoch.isoformat(),
        arrival_epoch=cell.arrival_epoch.isoformat(),
        tof_days=cell.tof_days,
        delta_v_total=cell.delta_v_total,
        delta_v1=cell.delta_v1,
        delta_v2=cell.delta_v2,
    )


@router.get("/czml/{task_id}/{kind}")
async def get_czml(task_id: str, kind: str):
    path = Path(settings.czml_storage_dir) / f"{task_id}_{kind}.czml"
    if not path.exists():
        raise HTTPException(status_code=404, detail="CZML not found")
    return FileResponse(path, media_type="application/json")
