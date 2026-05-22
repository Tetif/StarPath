class StarPathError(Exception):
    """Base application error."""


class MissionValidationError(StarPathError):
    """Invalid mission parameters."""


class LambertConvergenceError(StarPathError):
    """Lambert solver failed for the given window."""


class TaskNotFoundError(StarPathError):
    """Celery task not found."""
