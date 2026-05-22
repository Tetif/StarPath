import type { BodyId } from "../types";
import { PLANETS } from "../lib/scaleMode";

interface PlanetPickerProps {
  origin: BodyId | null;
  destination: BodyId | null;
  onSelectOrigin: (id: BodyId) => void;
  onSelectDestination: (id: BodyId) => void;
}

const SELECTABLE = PLANETS.map((p) => p.id);

export default function PlanetPicker({
  origin,
  destination,
  onSelectOrigin,
  onSelectDestination,
}: PlanetPickerProps) {
  return (
    <div className="planet-picker" data-tour="planet-picker">
      <div className="picker-row">
        <label>Origin</label>
        <select
          value={origin || ""}
          onChange={(e) => onSelectOrigin(e.target.value as BodyId)}
        >
          <option value="">Select...</option>
          {SELECTABLE.map((id) => (
            <option key={id} value={id}>
              {PLANETS.find((p) => p.id === id)?.name}
            </option>
          ))}
        </select>
      </div>
      <div className="picker-row">
        <label>Destination</label>
        <select
          value={destination || ""}
          onChange={(e) => onSelectDestination(e.target.value as BodyId)}
        >
          <option value="">Select...</option>
          {SELECTABLE.filter((id) => id !== origin).map((id) => (
            <option key={id} value={id}>
              {PLANETS.find((p) => p.id === id)?.name}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">Or click planets on the 3D scene</p>
    </div>
  );
}
