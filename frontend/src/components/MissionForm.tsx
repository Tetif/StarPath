import { useEffect, useState } from "react";
import type { BodyId, CalculationMode, VehicleId, VehicleProfile } from "../types";
import { listVehicles } from "../lib/api";
import PlanetPicker from "./PlanetPicker";

interface MissionFormProps {
  origin: BodyId | null;
  destination: BodyId | null;
  onOriginChange: (id: BodyId) => void;
  onDestinationChange: (id: BodyId) => void;
  onSubmit: (params: {
    departure_from: string;
    allow_gravity_assist: boolean;
    use_barycenter: boolean;
    vehicle_id: VehicleId;
    calculation_mode: CalculationMode;
  }) => void;
  loading: boolean;
  launchWarning?: string | null;
}

export default function MissionForm({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSubmit,
  loading,
  launchWarning,
}: MissionFormProps) {
  const [departureFrom, setDepartureFrom] = useState("2026-01-01");
  const [gravityAssist, setGravityAssist] = useState(false);
  const [barycenter, setBarycenter] = useState(false);
  const [vehicleId, setVehicleId] = useState<VehicleId>("starship");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("fast");
  const [vehicles, setVehicles] = useState<VehicleProfile[]>([]);

  useEffect(() => {
    listVehicles().then(setVehicles).catch(() => {});
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) return;
    onSubmit({
      departure_from: `${departureFrom}T00:00:00Z`,
      allow_gravity_assist: gravityAssist,
      use_barycenter: barycenter,
      vehicle_id: vehicleId,
      calculation_mode: calculationMode,
    });
  };

  return (
    <form className="mission-form" onSubmit={handleSubmit} data-tour="mission-form">
      <h2>Mission Parameters</h2>

      <PlanetPicker
        origin={origin}
        destination={destination}
        onSelectOrigin={onOriginChange}
        onSelectDestination={onDestinationChange}
      />

      <div className="picker-row">
        <label>Departure from</label>
        <input
          type="date"
          value={departureFrom}
          onChange={(e) => setDepartureFrom(e.target.value)}
        />
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={gravityAssist}
          onChange={(e) => setGravityAssist(e.target.checked)}
        />
        Allow gravity assists
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={barycenter}
          onChange={(e) => setBarycenter(e.target.checked)}
        />
        Use barycenter (outer planets)
      </label>

      <div className="picker-row">
        <label>Calculation mode</label>
        <select
          value={calculationMode}
          onChange={(e) => setCalculationMode(e.target.value as CalculationMode)}
        >
          <option value="fast">Fast — coarse grid (~30 s)</option>
          <option value="accurate">Accurate — fine grid (~2min)</option>
        </select>
      </div>
      <p className="mode-hint">
        {calculationMode === "fast"
          ? "Quick preview: 24×24 grid, interpolated ephemerides."
          : "Higher fidelity: 48×48 grid, sun safety checks, fine gravity-assist search."}
      </p>

      <div className="picker-row">
        <label>Spacecraft</label>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value as VehicleId)}
        >
          <option value="starship">Starship</option>
          <option value="none">Unlimited Δv</option>
        </select>
      </div>
      {selectedVehicle && selectedVehicle.id !== "none" && (
        <p className="vehicle-hint">
          Limits: {selectedVehicle.max_delta_v_total_km_s.toFixed(1)} km/s total,{" "}
          {selectedVehicle.max_delta_v_departure_km_s.toFixed(1)} km/s departure,{" "}
          {selectedVehicle.max_delta_v_arrival_km_s.toFixed(1)} km/s arrival
        </p>
      )}

      {launchWarning && <div className="warning-banner">{launchWarning}</div>}

      <button type="submit" disabled={loading || !origin || !destination}>
        {loading ? "Calculating..." : "Calculate Trajectories"}
      </button>
    </form>
  );
}
