from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    jpl_horizons_enabled: bool = False
    czml_storage_dir: str = "backend/data/czml"
    porkchop_cache_ttl: int = 86400
    porkchop_grid_departure: int = 24
    porkchop_grid_tof: int = 24
    trajectory_cache_ttl: int = 3600
    celery_sync_fallback: bool = True
    preset_cache_ttl: int = 604800
    max_concurrent_tasks: int = 10
    celery_soft_time_limit: int = 300
    # Minimum heliocentric distance during transfer (m); ~0.1 AU safety margin
    min_solar_distance_m: float = 1.5e10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
