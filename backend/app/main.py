from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.routes import calculate, ephemerides, presets, tasks, vehicles
from app.cache.redis_cache import cache
from app.core.config import settings
from app.core.exceptions import StarPathError
from app.tasks.worker import celery_workers_available


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="StarPath API",
    description="Orbital trajectory calculator",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calculate.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(presets.router, prefix="/api/v1")
app.include_router(vehicles.router, prefix="/api/v1")
app.include_router(ephemerides.router, prefix="/api/v1")


@app.exception_handler(StarPathError)
async def starpath_error_handler(request, exc: StarPathError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health")
async def health():
    redis_ok = False
    try:
        redis_ok = cache.ping()
    except Exception:
        pass
    worker_ok = celery_workers_available()
    ok = redis_ok and worker_ok
    return {
        "status": "ok" if ok else "degraded",
        "redis": redis_ok,
        "celery_worker": worker_ok,
    }
