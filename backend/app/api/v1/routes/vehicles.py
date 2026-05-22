from fastapi import APIRouter

from app.api.v1.schemas import VehicleSchema
from app.engine.vehicle import VEHICLE_PROFILES, VehicleId

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def _profile_to_schema(profile) -> VehicleSchema:
    return VehicleSchema(
        id=profile.id.value,
        name=profile.name,
        description=profile.description,
        max_delta_v_total_km_s=profile.max_delta_v_total_m_s / 1000.0,
        max_delta_v_departure_km_s=profile.max_delta_v_departure_m_s / 1000.0,
        max_delta_v_arrival_km_s=profile.max_delta_v_arrival_m_s / 1000.0,
        theoretical_max_delta_v_km_s=(
            profile.theoretical_max_delta_v_m_s / 1000.0
            if profile.theoretical_max_delta_v_m_s is not None
            else None
        ),
        dry_mass_t=profile.dry_mass_kg / 1000.0 if profile.dry_mass_kg else None,
        propellant_mass_t=profile.propellant_mass_kg / 1000.0 if profile.propellant_mass_kg else None,
        payload_mass_t=profile.payload_mass_kg / 1000.0 if profile.payload_mass_kg else None,
        isp_vacuum_s=profile.isp_vacuum_s,
    )


@router.get("", response_model=list[VehicleSchema])
async def list_vehicles():
    return [_profile_to_schema(p) for p in VEHICLE_PROFILES.values()]


@router.get("/{vehicle_id}", response_model=VehicleSchema)
async def get_vehicle(vehicle_id: str):
    vid = VehicleId(vehicle_id)
    return _profile_to_schema(VEHICLE_PROFILES[vid])
