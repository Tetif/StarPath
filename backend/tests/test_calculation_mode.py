from app.core.calculation_mode import CalculationMode, get_mode_settings, parse_calculation_mode
from app.cache.redis_cache import porkchop_cache_key, trajectory_cache_key


def test_parse_calculation_mode_defaults_to_fast():
    assert parse_calculation_mode(None) == CalculationMode.FAST
    assert parse_calculation_mode("accurate") == CalculationMode.ACCURATE
    assert parse_calculation_mode("unknown") == CalculationMode.FAST


def test_mode_settings_differ():
    fast = get_mode_settings(CalculationMode.FAST)
    accurate = get_mode_settings(CalculationMode.ACCURATE)
    assert fast.n_departure < accurate.n_departure
    assert fast.grid_sun_check_step_hours is None
    assert accurate.grid_sun_check_step_hours is not None
    assert fast.ga_departure_offset_step_days is None
    assert accurate.ga_departure_offset_step_days is not None
    assert fast.ga_leg_tof_steps < accurate.ga_leg_tof_steps


def test_cache_keys_include_mode():
    fast = porkchop_cache_key("earth", "mars", "2026-01-01", calculation_mode="fast")
    accurate = porkchop_cache_key("earth", "mars", "2026-01-01", calculation_mode="accurate")
    assert fast != accurate

    t_fast = trajectory_cache_key("earth", "mars", "2026-01-01", 200.0, "balanced", calculation_mode="fast")
    t_acc = trajectory_cache_key("earth", "mars", "2026-01-01", 200.0, "balanced", calculation_mode="accurate")
    assert t_fast != t_acc
