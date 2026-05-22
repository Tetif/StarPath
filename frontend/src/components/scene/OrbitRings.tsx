import { useCallback, useMemo } from "react";

import { useScene } from "../../context/SceneContext";
import { resolvePlanetPosition } from "../../hooks/usePlanetPositions";
import { visualSunRadius } from "../../lib/scaleMode";
import type { BodyId } from "../../types";
import {
  buildPlanetOrbitRingData,
  getOrbitAnchorPhase,
  getOrbitMotionForwardSign,
  type PlanetOrbitRingData,
} from "../../lib/orbitPaths";
import OrbitOutline from "./OrbitOutline";

const PLANET_IDS = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

/** Slightly inflate clip radius so thick line quads do not bleed through the Sun disc. */
const SUN_ORBIT_OCCLUSION_RADIUS = visualSunRadius() * 1.04;

const PLANET_ORBIT_COLORS: Record<(typeof PLANET_IDS)[number], string> = {
  mercury: "#B5B5B5",
  venus: "#E6C87A",
  earth: "#2E86AB",
  mars: "#CD5C5C",
  jupiter: "#C88B3A",
  saturn: "#F4D59E",
  uranus: "#73C2FB",
  neptune: "#3F54BA",
};

function PlanetOrbitRing({
  id,
  ring,
  color,
}: {
  id: (typeof PLANET_IDS)[number];
  ring: PlanetOrbitRingData;
  color: string;
}) {
  const { ephemeris, currentTimeRef } = useScene();

  const getAnchorPhase = useCallback(() => {
    const planetPosition = resolvePlanetPosition(id as BodyId, currentTimeRef.current, ephemeris);
    return getOrbitAnchorPhase(ring, currentTimeRef.current, planetPosition);
  }, [id, ring, ephemeris, currentTimeRef]);

  const getForwardSign = useCallback(() => {
    const time = currentTimeRef.current;
    const aheadTime = new Date(time.getTime() + 3_600_000);
    const planetPosition = resolvePlanetPosition(id as BodyId, time, ephemeris);
    const planetPositionAhead = resolvePlanetPosition(id as BodyId, aheadTime, ephemeris);
    return -getOrbitMotionForwardSign(ring, time, planetPosition, planetPositionAhead);
  }, [id, ring, ephemeris, currentTimeRef]);

  return (
    <OrbitOutline
      points={ring.points}
      color={color}
      opacity={0.38}
      lineWidth={2}
      occludeOriginRadius={SUN_ORBIT_OCCLUSION_RADIUS}
      motionGradient={{
        getAnchorPhase,
        getForwardSign,
        options: { closed: ring.closed, trailMinFactor: 0.01, trailFraction: 0.70 },
      }}
    />
  );
}

export default function OrbitRings() {
  const { ephemeris } = useScene();

  const rings = useMemo(
    () =>
      PLANET_IDS.map((id) => ({
        id,
        ring: buildPlanetOrbitRingData(id as BodyId, ephemeris),
        color: PLANET_ORBIT_COLORS[id],
      })),
    [ephemeris],
  );

  return (
    <group>
      {rings.map(({ id, ring, color }) => (
        <PlanetOrbitRing key={id} id={id} ring={ring} color={color} />
      ))}
    </group>
  );
}
