"""Fast vs accurate mission calculation presets."""

from dataclasses import dataclass
from enum import StrEnum


class CalculationMode(StrEnum):
    FAST = "fast"
    ACCURATE = "accurate"


@dataclass(frozen=True)
class ModeSettings:
    n_departure: int
    n_tof: int
    ephem_step_days: int | None
    grid_sun_check_step_hours: float | None
    run_ga_on_porkchop: bool
    trajectory_step_factor: float
    czml_tolerance_m: float
    czml_min_points: int
    # Gravity-assist route search (None / 1 = coarse fast presets)
    ga_departure_offset_step_days: float | None
    ga_departure_window_days: float
    ga_tof_multiplier_step: float | None
    ga_tof_multiplier_max: float
    ga_leg_tof_steps: int


MODE_SETTINGS: dict[CalculationMode, ModeSettings] = {
    CalculationMode.FAST: ModeSettings(
        n_departure=24,
        n_tof=24,
        ephem_step_days=4,
        grid_sun_check_step_hours=None,
        run_ga_on_porkchop=False,
        trajectory_step_factor=1.0,
        czml_tolerance_m=2e6,
        czml_min_points=64,
        ga_departure_offset_step_days=None,
        ga_departure_window_days=150.0,
        ga_tof_multiplier_step=None,
        ga_tof_multiplier_max=1.15,
        ga_leg_tof_steps=1,
    ),
    CalculationMode.ACCURATE: ModeSettings(
        n_departure=48,
        n_tof=48,
        ephem_step_days=1,
        grid_sun_check_step_hours=48.0,
        run_ga_on_porkchop=True,
        trajectory_step_factor=0.5,
        czml_tolerance_m=1e6,
        czml_min_points=96,
        ga_departure_offset_step_days=15.0,
        ga_departure_window_days=120.0,
        ga_tof_multiplier_step=0.02,
        ga_tof_multiplier_max=1.25,
        ga_leg_tof_steps=7,
    ),
}


def parse_calculation_mode(value: str | None) -> CalculationMode:
    if not value:
        return CalculationMode.FAST
    try:
        return CalculationMode(value.lower())
    except ValueError:
        return CalculationMode.FAST


def get_mode_settings(mode: CalculationMode | str | None) -> ModeSettings:
    if isinstance(mode, str):
        mode = parse_calculation_mode(mode)
    elif mode is None:
        mode = CalculationMode.FAST
    return MODE_SETTINGS[mode]
