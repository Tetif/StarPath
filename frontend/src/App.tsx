import { useCallback, useRef, useState } from "react";
import Scene from "./components/Scene";
import MissionForm from "./components/MissionForm";
import TrajectoryToggles from "./components/TrajectoryToggles";
import TrajectoryHUD from "./components/TrajectoryHUD";
import PorkchopPlot from "./components/PorkchopPlot";
import CalculationProgress from "./components/CalculationProgress";
import OnboardingTour, { restartTour } from "./components/OnboardingTour";
import { useTaskPolling } from "./hooks/useTaskPolling";
import type { BodyId, CalculationMode, TrajectoryKind, VehicleId } from "./types";
import "./index.css";

export default function App() {
  const [origin, setOrigin] = useState<BodyId | null>("earth");
  const [destination, setDestination] = useState<BodyId | null>("mars");
  const [visibleTrajectories, setVisibleTrajectories] = useState<
    Record<TrajectoryKind, boolean>
  >({ fastest: true, cheapest: true, balanced: true });
  const [activeKind, setActiveKind] = useState<TrajectoryKind>("balanced");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const clickStepRef = useRef<"origin" | "destination">("origin");

  const { taskId, status, loading, error, calculate } = useTaskPolling();

  const handlePlanetClick = useCallback((bodyId: BodyId) => {
    if (clickStepRef.current === "origin") {
      setOrigin(bodyId);
      clickStepRef.current = "destination";
    } else {
      setDestination((prev) => (bodyId !== origin ? bodyId : prev));
      clickStepRef.current = "origin";
    }
  }, [origin]);

  const handleSubmit = useCallback(
    (params: {
      departure_from: string;
      allow_gravity_assist: boolean;
      use_barycenter: boolean;
      vehicle_id: VehicleId;
      calculation_mode: CalculationMode;
    }) => {
      if (!origin || !destination) return;
      calculate({
        origin,
        destination,
        ...params,
      });
    },
    [origin, destination, calculate],
  );

  const toggleTrajectory = (kind: TrajectoryKind) => {
    setVisibleTrajectories((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const launchWarning = status?.results?.launch_window?.warning ?? null;
  const progress = status?.progress ?? 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-wordmark">StarPath</h1>
        <span className="subtitle">Orbital Trajectory Planner</span>
        <div className="header-controls">
          <button type="button" className="link-btn" onClick={restartTour}>
            Tour
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
          <button
            type="button"
            className="panel-collapse-btn panel-collapse-btn--side"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Show mission parameters" : "Hide mission parameters"}
            title={sidebarCollapsed ? "Show mission parameters" : "Hide mission parameters"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
          <div className="sidebar-content" hidden={sidebarCollapsed}>
          <MissionForm
            origin={origin}
            destination={destination}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onSubmit={handleSubmit}
            loading={loading}
            launchWarning={launchWarning}
          />

          {loading && (
            <CalculationProgress progress={progress} stage={status?.stage} />
          )}

          {error && <div className="error-banner">{error}</div>}

          {status?.results && (
            <>
              <TrajectoryToggles
                visible={visibleTrajectories}
                onToggle={toggleTrajectory}
                activeKind={activeKind}
                onActiveKindChange={setActiveKind}
              />
              <TrajectoryHUD results={status.results} hoveredKind={activeKind} />
              <PorkchopPlot
                porkchop={status.results.porkchop ?? null}
                referenceDeparture={status.results.launch_window?.reference_departure}
              />
            </>
          )}
          </div>
        </aside>

        <section className="scene-panel">
          <Scene
            origin={origin}
            destination={destination}
            results={status?.results ?? null}
            taskId={taskId}
            visibleTrajectories={visibleTrajectories}
            activeKind={activeKind}
            onTrajectorySelect={setActiveKind}
            onPlanetClick={handlePlanetClick}
          />
        </section>
      </main>

      <OnboardingTour />
    </div>
  );
}
