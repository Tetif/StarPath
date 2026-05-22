import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useScene } from "../../context/SceneContext";
import { resolveMoonLocalOffset, resolvePlanetPosition } from "../../hooks/usePlanetPositions";
import type { BodyId } from "../../types";
import { MOONS, type MoonDefinition } from "../../lib/bodies";
import { getMoonVisual } from "../../lib/planetAssets";
import { LitPlanetSurfaceMaterial, MOON_LIGHT_AMBIENT } from "../../lib/planetTexture";
import {
  applyMoonOrbitDisplayFloor,
  getDistanceScaledBodyRadius,
  PLANETS,
  visualMoonRadius,
  visualPlanetRadius,
} from "../../lib/scaleMode";
import BodyLabel from "./BodyLabel";

interface MoonMeshProps {
  moon: MoonDefinition;
  onPlanetClick?: (bodyId: BodyId) => void;
  onBodyFly?: (bodyId: string) => void;
}

/** Renders a moon in planet-centric coordinates (parent group must follow the planet). */
export function MoonMesh({ moon, onPlanetClick, onBodyFly }: MoonMeshProps) {
  const { ephemeris, currentTimeRef } = useScene();
  const { camera } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const sunDirectionRef = useRef(new THREE.Vector3(0, 1, 0));
  const moonPosRef = useRef(new THREE.Vector3());

  const visual = getMoonVisual(moon.id);
  const baseRadius = visualMoonRadius(moon.radiusM);
  const clickable = moon.clickable === true;
  const displayRadiusRef = useRef(baseRadius);
  const worldPosRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!groupRef.current || !bodyRef.current) return;

    const time = currentTimeRef.current;
    const planetPos = resolvePlanetPosition(moon.parentId, time, ephemeris);

    const parentPlanet = PLANETS.find((p) => p.id === moon.parentId);
    const parentBaseRadius = parentPlanet ? visualPlanetRadius(parentPlanet.radius) : 0;
    const parentCameraDistance = camera.position.distanceTo(planetPos);
    const parentDisplayRadius = getDistanceScaledBodyRadius(parentBaseRadius, parentCameraDistance);

    const local = applyMoonOrbitDisplayFloor(
      resolveMoonLocalOffset(moon, time, ephemeris),
      parentDisplayRadius,
    );
    groupRef.current.position.copy(local);
    moonPosRef.current.copy(planetPos).add(local);
    if (moonPosRef.current.lengthSq() > 0) {
      sunDirectionRef.current.copy(moonPosRef.current).negate().normalize();
    } else {
      sunDirectionRef.current.set(0, 1, 0);
    }

    groupRef.current.getWorldPosition(worldPosRef.current);
    const cameraDistance = camera.position.distanceTo(worldPosRef.current);
    const displayRadius = getDistanceScaledBodyRadius(baseRadius, cameraDistance);
    if (Math.abs(displayRadius - displayRadiusRef.current) > displayRadiusRef.current * 0.03) {
      const scale = displayRadius / baseRadius;
      bodyRef.current.scale.setScalar(scale);
      displayRadiusRef.current = displayRadius;
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        <mesh
          userData={{ bodyId: clickable ? moon.id : undefined }}
          onClick={(e) => {
            e.stopPropagation();
            if (clickable) onPlanetClick?.(moon.id as BodyId);
          }}
        >
          <sphereGeometry args={[baseRadius, 32, 32]} />
          <LitPlanetSurfaceMaterial
            textureUrl={visual?.textureUrl}
            fallbackColor={visual?.fallbackColor ?? moon.color}
            sunDirectionRef={sunDirectionRef}
            tint={visual?.tint}
            ambient={MOON_LIGHT_AMBIENT}
          />
        </mesh>
        <BodyLabel
          name={moon.name}
          bodyRadius={baseRadius}
          small
          occludedBy={moon.parentId}
          onClick={onBodyFly ? () => onBodyFly(moon.id) : undefined}
        />
      </group>
    </group>
  );
}

interface MoonsProps {
  parentId: BodyId;
  onPlanetClick?: (bodyId: BodyId) => void;
  onBodyFly?: (bodyId: string) => void;
}

export default function Moons({ parentId, onPlanetClick, onBodyFly }: MoonsProps) {
  const moons = MOONS.filter((m) => m.parentId === parentId);
  if (moons.length === 0) return null;

  return (
    <group>
      {moons.map((moon) => (
        <MoonMesh
          key={moon.id}
          moon={moon}
          onPlanetClick={onPlanetClick}
          onBodyFly={onBodyFly}
        />
      ))}
    </group>
  );
}
