from enum import StrEnum


class BodyId(StrEnum):
    SUN = "sun"
    MERCURY = "mercury"
    VENUS = "venus"
    EARTH = "earth"
    MARS = "mars"
    JUPITER = "jupiter"
    SATURN = "saturn"
    URANUS = "uranus"
    NEPTUNE = "neptune"
    MOON = "moon"


class Frame(StrEnum):
    J2000 = "j2000"
    EARTH_ECLIPTIC = "earth_ecliptic"
    BARYCENTER = "barycenter"


class TaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TrajectoryKind(StrEnum):
    FASTEST = "fastest"
    CHEAPEST = "cheapest"
    BALANCED = "balanced"
