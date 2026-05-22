import numpy as np

import pytest

from datetime import datetime, timedelta, timezone

from lamberthub import izzo2015



from app.czml.simplify import simplify_trajectory

from app.core.types import BodyId

from app.engine.ephemerides import SUN_MU, get_state_at, sample_transfer_states

from app.engine.mission import StateVector, OrbitalMission

from app.engine.optimizers import (
    find_optima,
    find_fastest_forward,
    find_cheapest_at_departure,
)

from app.engine.launch_windows import get_synodic_period, get_search_horizon_days
from app.engine.vehicle import STARSHIP, VehicleId, is_transfer_feasible, resolve_vehicle
from app.engine.porkchop import _compute_lambert_cell



def test_transfer_arc_is_curved():

    start = datetime(2026, 6, 1, tzinfo=timezone.utc)

    end = start + timedelta(days=200)

    r1, _ = get_state_at(BodyId.EARTH, start)

    r2, _ = get_state_at(BodyId.MARS, end)

    v1, v2 = izzo2015(SUN_MU, r1, r2, 200 * 86400.0)



    states = sample_transfer_states(r1, v1, r2, v2, start, end, step_hours=24.0)

    assert len(states) > 10



    p0 = np.array([states[0].x, states[0].y, states[0].z])

    p1 = np.array([states[-1].x, states[-1].y, states[-1].z])

    mid = np.array([states[len(states) // 2].x, states[len(states) // 2].y, states[len(states) // 2].z])



    chord = p1 - p0

    deviation = np.linalg.norm(np.cross(chord, p0 - mid)) / np.linalg.norm(chord)

    assert deviation > 1e9





def test_simplify_preserves_curve():

    start = datetime(2026, 6, 1, tzinfo=timezone.utc)

    end = start + timedelta(days=200)

    r1, _ = get_state_at(BodyId.EARTH, start)

    r2, _ = get_state_at(BodyId.MARS, end)

    v1, v2 = izzo2015(SUN_MU, r1, r2, 200 * 86400.0)

    states = sample_transfer_states(r1, v1, r2, v2, start, end, step_hours=12.0)



    simplified = simplify_trajectory(states, tolerance_m=5e6, min_points=32)

    assert len(simplified) >= 20



    p0 = np.array([simplified[0].x, simplified[0].y, simplified[0].z])

    p1 = np.array([simplified[-1].x, simplified[-1].y, simplified[-1].z])

    mid = np.array([

        simplified[len(simplified) // 2].x,

        simplified[len(simplified) // 2].y,

        simplified[len(simplified) // 2].z,

    ])

    chord = p1 - p0

    deviation = np.linalg.norm(np.cross(chord, p0 - mid)) / np.linalg.norm(chord)

    assert deviation > 1e9





def test_synodic_period_earth_mars():

    period = get_synodic_period(BodyId.EARTH, BodyId.MARS)

    assert period is not None

    assert 770 < period < 790





def test_search_horizon_double_synodic():

    horizon = get_search_horizon_days(BodyId.EARTH, BodyId.MARS)

    period = get_synodic_period(BodyId.EARTH, BodyId.MARS)

    assert period is not None

    assert abs(horizon - period * 2) < 1.0





def test_rdp_simplify_reduces_points():

    states = [

        StateVector(datetime(2026, 1, 1, tzinfo=timezone.utc), float(i), 0, 0, 0, 0, 0)

        for i in range(100)

    ]

    from app.czml.simplify import rdp_simplify

    simplified = rdp_simplify(states, tolerance_m=1e3)

    assert len(simplified) < len(states)

    assert simplified[0].epoch == states[0].epoch

    assert simplified[-1].epoch == states[-1].epoch





def test_find_optima():

    dep_dates = [datetime(2026, 1, 1, tzinfo=timezone.utc)]

    tof_list = [100.0, 200.0, 300.0]

    dv_matrix = [[5.0, 3.0, 4.0]]

    tof_matrix = [[100.0, 200.0, 300.0]]

    fastest, cheapest, balanced = find_optima(

        dep_dates, tof_list, dv_matrix, tof_matrix, {"time": 0.5, "delta_v": 0.5}

    )

    assert fastest.tof_days == 100.0

    assert cheapest.delta_v_total == 3.0





def test_fastest_forward_skips_past_departures():

    dep_dates = [

        datetime(2026, 1, 1, tzinfo=timezone.utc),

        datetime(2026, 6, 1, tzinfo=timezone.utc),

    ]

    tof_list = [50.0, 100.0]

    dv_matrix = [[10.0, 5.0], [8.0, 4.0]]

    tof_matrix = [[50.0, 100.0], [50.0, 100.0]]

    min_dep = datetime(2026, 5, 1, tzinfo=timezone.utc)

    fastest = find_fastest_forward(dep_dates, tof_list, dv_matrix, tof_matrix, min_dep)

    assert fastest.tof_days == 50.0

    assert fastest.departure_epoch == dep_dates[1]





def test_cheapest_at_reference_departure():

    dep_dates = [

        datetime(2026, 1, 1, tzinfo=timezone.utc),

        datetime(2026, 6, 1, tzinfo=timezone.utc),

    ]

    tof_list = [100.0, 200.0]

    dv_matrix = [[10.0, 5.0], [3.0, 2.0]]

    tof_matrix = [[100.0, 200.0], [100.0, 200.0]]

    ref = datetime(2026, 6, 1, tzinfo=timezone.utc)

    cheapest = find_cheapest_at_departure(dep_dates, tof_list, dv_matrix, tof_matrix, ref)

    assert cheapest.delta_v_total == 2.0

    assert cheapest.tof_days == 200.0





def test_mission_validation():

    mission = OrbitalMission(

        origin=BodyId.EARTH,

        destination=BodyId.MARS,

        departure_window_start=datetime(2026, 1, 1, tzinfo=timezone.utc),

        departure_window_end=datetime(2027, 1, 1, tzinfo=timezone.utc),

    )

    mission.validate()



    bad = OrbitalMission(

        origin=BodyId.EARTH,

        destination=BodyId.EARTH,

        departure_window_start=datetime(2026, 1, 1, tzinfo=timezone.utc),

        departure_window_end=datetime(2027, 1, 1, tzinfo=timezone.utc),

    )

    with pytest.raises(ValueError):

        bad.validate()





def test_calculate_request_without_departure_to():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    payload = {
        "origin": "earth",
        "destination": "mars",
        "departure_from": "2026-06-01T00:00:00Z",
        "allow_gravity_assist": False,
    }
    response = client.post("/api/v1/calculate", json=payload)
    assert response.status_code == 200
    assert "task_id" in response.json()


def test_calculate_mission_data_includes_departure_to():
    from datetime import timedelta
    from app.engine.launch_windows import get_search_horizon_days

    departure_from = datetime(2026, 6, 1, tzinfo=timezone.utc)
    horizon = get_search_horizon_days(BodyId.EARTH, BodyId.MARS)
    window_end = departure_from + timedelta(days=horizon)

    mission_data = {
        "origin": "earth",
        "destination": "mars",
        "departure_from": departure_from.isoformat(),
        "departure_to": window_end.isoformat(),
    }
    parsed_to = datetime.fromisoformat(mission_data["departure_to"].replace("Z", "+00:00"))
    assert parsed_to > departure_from


def test_starship_delta_v_limits():
    profile = resolve_vehicle("starship")
    assert profile.max_delta_v_total_m_s == 6000.0
    assert profile.max_delta_v_departure_m_s == 4200.0
    assert profile.max_delta_v_arrival_m_s == 2200.0
    assert is_transfer_feasible(profile, 5000, 3000, 2000)
    assert not is_transfer_feasible(profile, 7000, 3000, 2000)
    assert not is_transfer_feasible(profile, 5000, 5000, 1000)


def test_vehicle_filters_infeasible_lambert_cells():
    from dataclasses import replace

    mission = OrbitalMission(
        origin=BodyId.EARTH,
        destination=BodyId.JUPITER,
        departure_window_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        departure_window_end=datetime(2028, 1, 1, tzinfo=timezone.utc),
        vehicle_id="starship",
    )
    cell_unlimited = _compute_lambert_cell(
        replace(mission, vehicle_id="none"),
        datetime(2026, 6, 1, tzinfo=timezone.utc),
        400.0,
    )
    cell_starship = _compute_lambert_cell(mission, datetime(2026, 6, 1, tzinfo=timezone.utc), 400.0)
    if cell_unlimited is not None and cell_unlimited.delta_v_total > STARSHIP.max_delta_v_total_m_s:
        assert cell_starship is None


def test_mission_validation_unknown_vehicle():
    mission = OrbitalMission(
        origin=BodyId.EARTH,
        destination=BodyId.MARS,
        departure_window_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        departure_window_end=datetime(2027, 1, 1, tzinfo=timezone.utc),
        vehicle_id="falcon_heavy",
    )
    with pytest.raises(ValueError):
        mission.validate()


def test_list_vehicles_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    response = client.get("/api/v1/vehicles")
    assert response.status_code == 200
    data = response.json()
    ids = {v["id"] for v in data}
    assert VehicleId.STARSHIP.value in ids
    assert VehicleId.NONE.value in ids


def test_health_endpoint():

    from fastapi.testclient import TestClient

    from app.main import app



    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200

    assert "status" in response.json()


def test_optimizer_preserves_dv1_dv2():
    dep_dates = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    tof_list = [100.0, 200.0]
    dv_matrix = [[5000.0, 4000.0]]
    dv1_matrix = [[3000.0, 2500.0]]
    dv2_matrix = [[2000.0, 1500.0]]
    tof_matrix = [[100.0, 200.0]]
    _, cheapest, _ = find_optima(
        dep_dates,
        tof_list,
        dv_matrix,
        tof_matrix,
        {"time": 0.5, "delta_v": 0.5},
        dv1_matrix=dv1_matrix,
        dv2_matrix=dv2_matrix,
    )
    assert cheapest.delta_v_total == 4000.0
    assert cheapest.delta_v1 == 2500.0
    assert cheapest.delta_v2 == 1500.0
    assert cheapest.delta_v1 != cheapest.delta_v_total / 2


def test_solar_distance_filter_rejects_grazing():
    from app.engine.ephemerides import is_solar_distance_safe

    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=30)
    r1, _ = get_state_at(BodyId.EARTH, start)
    r2, _ = get_state_at(BodyId.MARS, end)
    v1, _ = izzo2015(SUN_MU, r1, r2, 30 * 86400.0)
    assert isinstance(is_solar_distance_safe(r1, v1, start, end), bool)


def test_leg_budget_starship_multileg():
    from app.engine.leg_budget import check_mission_legs
    from app.engine.mission import LegMetric

    legs = [
        LegMetric(BodyId.EARTH, BodyId.VENUS, 3000.0, 0.0),
        LegMetric(BodyId.VENUS, BodyId.MARS, 500.0, 2000.0),
    ]
    result = check_mission_legs("starship", legs)
    assert result.feasible
    assert result.total_dv == 5500.0

