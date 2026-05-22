import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";

import type { BodyId, TaskResults, TrajectoryKind } from "../types";
import { SceneProvider, useScene, SceneContextBridge } from "../context/SceneContext";
import { useEphemeris } from "../hooks/useEphemeris";
import { usePlaybackKeyboard } from "../hooks/usePlaybackKeyboard";

import SceneControls from "./SceneControls";
import FlightControls from "./FlightControls";
import SceneClockUpdater from "./scene/SceneClockUpdater";
import SolarEnvironment from "./scene/SolarEnvironment";
import FloatingOrigin from "./scene/FloatingOrigin";
import Sun from "./scene/Sun";
import Planets from "./scene/Planets";
import OrbitRings from "./scene/OrbitRings";
import MoonOrbitRings from "./scene/MoonOrbitRings";
import Trajectories, { StarshipCrafts } from "./scene/Trajectories";
import CameraRig from "./scene/CameraRig";
import { preloadSurfaceTextures } from "../lib/planetTexture";

preloadSurfaceTextures();

interface SceneProps {
  origin: BodyId | null;
  destination: BodyId | null;
  results: TaskResults | null;
  taskId: string | null;
  visibleTrajectories: Record<TrajectoryKind, boolean>;
  activeKind: TrajectoryKind;
  onTrajectorySelect: (kind: TrajectoryKind) => void;
  onPlanetClick: (bodyId: BodyId) => void;
}

function SceneCanvas({
  scene,
  onPlanetClick,
  onPlanetFly,
  onBodyFly,
}: {
  scene: ReturnType<typeof useScene>;
  onPlanetClick: (bodyId: BodyId) => void;
  onPlanetFly: (bodyId: BodyId) => void;
  onBodyFly: (bodyId: string) => void;
}) {
  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true }}
      camera={{ fov: 45, near: 1, far: 1e14, position: [0, 0, 8e11] }}
    >
      <SceneContextBridge value={scene}>
        <SceneClockUpdater />
        <SolarEnvironment />
        <FloatingOrigin>
          <Sun onPlanetClick={onPlanetClick} onPlanetFly={onPlanetFly} />
          <OrbitRings />
          <Planets
            onPlanetClick={onPlanetClick}
            onPlanetFly={onPlanetFly}
            onBodyFly={onBodyFly}
          />
          <MoonOrbitRings />
        </FloatingOrigin>
        <Trajectories />
        <Suspense fallback={null}>
          <StarshipCrafts />
        </Suspense>
        <CameraRig />
      </SceneContextBridge>
    </Canvas>
  );
}

function SceneLayout({
  onPlanetClick,
  activeKind,
  hasTrajectories,
}: {
  onPlanetClick: (bodyId: BodyId) => void;
  activeKind: TrajectoryKind;
  hasTrajectories: boolean;
}) {
  const scene = useScene();
  usePlaybackKeyboard();

  return (
    <div className="scene-container">
      <SceneCanvas
        scene={scene}
        onPlanetClick={onPlanetClick}
        onPlanetFly={scene.flyToBody}
        onBodyFly={scene.flyToBody}
      />
      <SceneControls />
      <FlightControls activeKind={activeKind} hasTrajectories={hasTrajectories} />
    </div>
  );
}

export default function Scene({
  origin,
  destination,
  results,
  taskId,
  visibleTrajectories,
  activeKind,
  onTrajectorySelect,
  onPlanetClick,
}: SceneProps) {
  const ephemeris = useEphemeris(results);
  const hasTrajectories = Boolean(results?.trajectories);

  return (
    <SceneProvider
      origin={origin}
      destination={destination}
      ephemeris={ephemeris}
      results={results}
      taskId={taskId}
      visibleTrajectories={visibleTrajectories}
      activeKind={activeKind}
      onTrajectorySelect={onTrajectorySelect}
    >
      <SceneLayout
        onPlanetClick={onPlanetClick}
        activeKind={activeKind}
        hasTrajectories={hasTrajectories}
      />
    </SceneProvider>
  );
}
