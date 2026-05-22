import threading
import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException

from app.api.v1.schemas import CalculateRequest, CalculateResponse
from app.core.config import settings
from app.engine.launch_windows import get_search_horizon_days
from app.engine.mission import OrbitalMission
from app.tasks.calculate import run_mission_calculation
from app.tasks.worker import celery_workers_available
router = APIRouter(prefix="/calculate", tags=["calculate"])


@router.post("", response_model=CalculateResponse)
async def submit_calculation(request: CalculateRequest):
    try:
        horizon_days = get_search_horizon_days(request.origin, request.destination)
        window_end = request.departure_from + timedelta(days=horizon_days)
        mission = OrbitalMission(
            origin=request.origin,
            destination=request.destination,
            departure_window_start=request.departure_from,
            departure_window_end=window_end,
            allow_gravity_assist=request.allow_gravity_assist,
            use_barycenter=request.use_barycenter,
            weights={"time": request.weights.time, "delta_v": request.weights.delta_v},
            vehicle_id=request.vehicle_id,
        )
        mission.validate()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    mission_data = {
        "origin": request.origin.value,
        "destination": request.destination.value,
        "departure_from": request.departure_from.isoformat(),
        # Kept for Celery workers / clients still expecting departure_to
        "departure_to": window_end.isoformat(),
        "allow_gravity_assist": request.allow_gravity_assist,
        "use_barycenter": request.use_barycenter,
        "weights": {"time": request.weights.time, "delta_v": request.weights.delta_v},
        "vehicle_id": request.vehicle_id,
        "calculation_mode": request.calculation_mode.value,
    }

    if celery_workers_available():
        task = run_mission_calculation.apply_async(
            args=[mission_data],
            queue="calculations",
        )
        return CalculateResponse(task_id=task.id)

    if settings.celery_sync_fallback:
        task_id = str(uuid.uuid4())

        def _run_local() -> None:
            run_mission_calculation.apply(args=[mission_data], task_id=task_id)

        threading.Thread(target=_run_local, daemon=True).start()
        return CalculateResponse(task_id=task_id)

    raise HTTPException(
        status_code=503,
        detail="Celery worker is not running. Start it with: .\\start.ps1",
    )