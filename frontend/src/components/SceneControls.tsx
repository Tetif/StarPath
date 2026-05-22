import type { BodyId } from "../types";
import { MOONS } from "../lib/bodies";
import { NAVIGABLE_BODIES } from "../lib/planetAssets";
import { PLANETS } from "../lib/scaleMode";
import { useScene } from "../context/SceneContext";

function bodyDisplayName(id: BodyId): string {
  const planet = PLANETS.find((p) => p.id === id);
  if (planet) return planet.name;
  const moon = MOONS.find((m) => m.id === id);
  if (moon) return moon.name;
  return id;
}

export default function SceneControls() {
  const {
    flyToPlanet,
    flyToSolarSystemOverview,
  } = useScene();

  return (
    <div className="scene-overlay scene-controls" data-tour="scene-nav">
      <div className="control-group">
        <button type="button" onClick={flyToSolarSystemOverview}>
          Solar system
        </button>
        <button type="button" onClick={() => flyToPlanet("earth")}>
          Earth
        </button>
        <button type="button" onClick={() => flyToPlanet("mars")}>
          Mars
        </button>
        <select
          aria-label="Fly to planet"
          value=""
          onChange={(e) => {
            const id = e.target.value as BodyId;
            if (id) flyToPlanet(id);
            e.target.value = "";
          }}
        >
          <option value="">Fly to…</option>
          {NAVIGABLE_BODIES.map((id) => (
            <option key={id} value={id}>
              {bodyDisplayName(id)}
            </option>
          ))}
        </select>
      </div>
      <div className="scene-camera-hint" data-tour="camera-hint">
        <span><strong>Zoom</strong> — scroll wheel</span>
        <span><strong>Pan</strong> — right-click, drag</span>
        <span><strong>Rotate</strong> — left-click, drag</span>
      </div>
    </div>
  );
}
