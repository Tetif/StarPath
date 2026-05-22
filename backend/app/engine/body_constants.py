"""Standard gravitational parameters and SOI radii for patched-conics."""

from app.core.types import BodyId

# Standard gravitational parameters (m^3/s^2), NAIF/Astropy values
BODY_MU_M3_S2: dict[BodyId, float] = {
    BodyId.SUN: 1.32712440018e20,
    BodyId.MERCURY: 2.203209e13,
    BodyId.VENUS: 3.24858592e14,
    BodyId.EARTH: 3.986004418e14,
    BodyId.MOON: 4.9048695e12,
    BodyId.MARS: 4.282837521e13,
    BodyId.JUPITER: 1.26686534e17,
    BodyId.SATURN: 3.7931187e16,
    BodyId.URANUS: 5.793939e15,
    BodyId.NEPTUNE: 6.836529e15,
}

# SOI radius (m) — from mission catalog km values
BODY_SOI_RADIUS_M: dict[BodyId, float] = {
    BodyId.MERCURY: 112_000_000.0,
    BodyId.VENUS: 616_000_000.0,
    BodyId.EARTH: 925_000_000.0,
    BodyId.MOON: 66_000_000.0,
    BodyId.MARS: 577_000_000.0,
    BodyId.JUPITER: 48_200_000_000.0,
    BodyId.SATURN: 54_800_000_000.0,
    BodyId.URANUS: 51_800_000_000.0,
    BodyId.NEPTUNE: 86_000_000_000.0,
}

# Physical radius (m) for flyby altitude checks
BODY_RADIUS_M: dict[BodyId, float] = {
    BodyId.SUN: 696_340_000.0,
    BodyId.MERCURY: 2_439_700.0,
    BodyId.VENUS: 6_051_800.0,
    BodyId.EARTH: 6_371_000.0,
    BodyId.MOON: 1_737_400.0,
    BodyId.MARS: 3_389_500.0,
    BodyId.JUPITER: 69_911_000.0,
    BodyId.SATURN: 58_232_000.0,
    BodyId.URANUS: 25_362_000.0,
    BodyId.NEPTUNE: 24_622_000.0,
}

# Minimum flyby altitude above body surface (m)
MIN_FLYBY_ALTITUDE_M = 300_000.0
