from app.core.calculation_mode import CalculationMode, get_mode_settings
from app.engine.gravity_assist import (
    _ga_departure_offsets,
    _ga_leg_tof_fraction_variants,
    _ga_tof_multipliers,
)


def test_fast_ga_search_is_coarse():
    cfg = get_mode_settings(CalculationMode.FAST)
    assert _ga_departure_offsets(cfg) == [-90.0, -45.0, 0.0, 45.0, 90.0]
    assert _ga_tof_multipliers(cfg, has_assist=True) == [1.0, 1.05, 1.1, 1.15]
    assert len(_ga_leg_tof_fraction_variants(2, cfg.ga_leg_tof_steps)) == 1


def test_accurate_ga_search_is_finer():
    cfg = get_mode_settings(CalculationMode.ACCURATE)
    offsets = _ga_departure_offsets(cfg)
    assert len(offsets) > 5
    assert offsets[0] == -120.0
    assert offsets[-1] == 120.0
    assert cfg.ga_departure_offset_step_days == 15.0

    mults = _ga_tof_multipliers(cfg, has_assist=True)
    assert len(mults) > 4
    assert mults[0] == 1.0
    assert mults[-1] == 1.24

    variants = _ga_leg_tof_fraction_variants(2, cfg.ga_leg_tof_steps)
    assert len(variants) == cfg.ga_leg_tof_steps
    assert abs(sum(variants[0]) - 1.0) < 1e-9
