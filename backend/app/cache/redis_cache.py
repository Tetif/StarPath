"""Redis cache layer."""

import hashlib
import json
from typing import Any

import redis

from app.core.config import settings


class RedisCache:
    def __init__(self, url: str | None = None):
        self.client = redis.from_url(url or settings.redis_url, decode_responses=True)

    def get(self, key: str) -> Any | None:
        data = self.client.get(key)
        if data is None:
            return None
        return json.loads(data)

    def set(self, key: str, value: Any, ttl: int) -> None:
        self.client.setex(key, ttl, json.dumps(value, default=str))

    def delete(self, key: str) -> None:
        self.client.delete(key)

    def ping(self) -> bool:
        return self.client.ping()


def _hash_dict(data: dict | None) -> str:
    if not data:
        return "default"
    payload = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:12]


def _hash_route(route: list[str] | None) -> str:
    if not route:
        return "direct"
    return "-".join(route)


def porkchop_cache_key(
    origin: str,
    dest: str,
    dep_from: str,
    vehicle_id: str = "none",
    allow_gravity_assist: bool = False,
    weights: dict | None = None,
    calculation_mode: str = "fast",
) -> str:
    w_hash = _hash_dict(weights)
    ga = "ga1" if allow_gravity_assist else "ga0"
    return f"porkchop:{origin}:{dest}:{dep_from}:{vehicle_id}:{ga}:{calculation_mode}:{w_hash}"


def trajectory_cache_key(
    origin: str,
    dest: str,
    dep: str,
    tof: float,
    kind: str,
    vehicle_id: str = "none",
    allow_gravity_assist: bool = False,
    assist_route: list[str] | None = None,
    calculation_mode: str = "fast",
) -> str:
    ga = "ga1" if allow_gravity_assist else "ga0"
    route = _hash_route(assist_route)
    return f"trajectory:{origin}:{dest}:{dep}:{tof:.1f}:{kind}:{vehicle_id}:{ga}:{calculation_mode}:{route}"


cache = RedisCache()
