import type { TaskResults, TrajectoryKind } from "../types";

interface TrajectoryHUDProps {
  results: TaskResults | null;
  hoveredKind: TrajectoryKind | null;
}

function sameCalendarDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function TrajectoryHUD({ results, hoveredKind }: TrajectoryHUDProps) {
  if (!results?.trajectories) return null;

  const kind = hoveredKind || "balanced";
  const traj = results.trajectories[kind];
  if (!traj) return null;

  const m = traj.metrics;
  const vehicle = results.launch_window?.vehicle;
  const dvTotalKmS = m.delta_v_total / 1000;
  const refDeparture = results.launch_window?.reference_departure;
  const overBudget =
    vehicle &&
    vehicle.vehicle_id !== "none" &&
    dvTotalKmS > vehicle.max_delta_v_total_km_s + 1e-6;
  const overDeparture =
    vehicle &&
    vehicle.vehicle_id !== "none" &&
    m.delta_v1 / 1000 > vehicle.max_delta_v_departure_km_s + 1e-6;
  const overArrival =
    vehicle &&
    vehicle.vehicle_id !== "none" &&
    m.delta_v2 / 1000 > vehicle.max_delta_v_arrival_km_s + 1e-6;
  const showOptimalNote =
    kind === "fastest" &&
    refDeparture &&
    !sameCalendarDay(m.departure_epoch, refDeparture);
  const legMetrics = traj.leg_metrics ?? [];

  return (
    <div className="trajectory-hud" data-tour="metrics">
      <h4>{kind.charAt(0).toUpperCase() + kind.slice(1)} Route</h4>
      <dl>
        <dt>Total Δv</dt>
        <dd className={overBudget ? "metric-over-budget" : undefined}>
          {dvTotalKmS.toFixed(2)} km/s
          {vehicle && vehicle.vehicle_id !== "none" && (
            <span className="metric-limit">
              {" "}
              / {vehicle.max_delta_v_total_km_s.toFixed(1)} km/s
            </span>
          )}
        </dd>
        <dt>Departure Δv</dt>
        <dd className={overDeparture ? "metric-over-budget" : undefined}>
          {(m.delta_v1 / 1000).toFixed(2)} km/s
          {vehicle && vehicle.vehicle_id !== "none" && (
            <span className="metric-limit">
              {" "}
              / {vehicle.max_delta_v_departure_km_s.toFixed(1)} km/s
            </span>
          )}
        </dd>
        <dt>Arrival Δv</dt>
        <dd className={overArrival ? "metric-over-budget" : undefined}>
          {(m.delta_v2 / 1000).toFixed(2)} km/s
          {vehicle && vehicle.vehicle_id !== "none" && (
            <span className="metric-limit">
              {" "}
              / {vehicle.max_delta_v_arrival_km_s.toFixed(1)} km/s
            </span>
          )}
        </dd>
        {vehicle && vehicle.vehicle_id !== "none" && (
          <>
            <dt>Vehicle</dt>
            <dd>{vehicle.vehicle_name}</dd>
          </>
        )}
        <dt>Time of flight</dt>
        <dd>{m.tof_days.toFixed(0)} days</dd>
        {showOptimalNote ? (
          <>
            <dt>Reference date</dt>
            <dd>{new Date(refDeparture).toLocaleDateString()}</dd>
            <dt>Optimal launch</dt>
            <dd>{new Date(m.departure_epoch).toLocaleDateString()}</dd>
          </>
        ) : (
          <>
            <dt>Departure</dt>
            <dd>{new Date(m.departure_epoch).toLocaleDateString()}</dd>
          </>
        )}
        <dt>Arrival</dt>
        <dd>{new Date(m.arrival_epoch).toLocaleDateString()}</dd>
        {traj.assist_bodies && traj.assist_bodies.length > 0 && (
          <>
            <dt>Gravity assists</dt>
            <dd>{traj.assist_bodies.join(" → ")}</dd>
          </>
        )}
        {legMetrics.length > 1 && (
          <>
            <dt>Leg breakdown</dt>
            <dd>
              <ul className="leg-metrics-list">
                {legMetrics.map((leg, i) => (
                  <li key={i}>
                    {leg.from_body} → {leg.to_body}: dep {(leg.dv_departure / 1000).toFixed(2)}, arr{" "}
                    {(leg.dv_arrival / 1000).toFixed(2)} km/s
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
