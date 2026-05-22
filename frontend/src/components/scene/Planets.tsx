import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useScene } from "../../context/SceneContext";
import { resolvePlanetPosition } from "../../hooks/usePlanetPositions";
import type { BodyId } from "../../types";
import { getPlanetVisual } from "../../lib/planetAssets";
import { LitPlanetSurfaceMaterial } from "../../lib/planetTexture";
import { registerPlanetOccluder } from "../../lib/labelPlanetOcclusion";
import { getDistanceScaledBodyRadius, PLANETS, visualPlanetRadius } from "../../lib/scaleMode";
import { daysSinceJ2000 } from "../../lib/time";
import BodyLabel from "./BodyLabel";
import Moons from "./Moons";

interface PlanetMeshProps {
  planetId: BodyId;
  name: string;
  radius: number;
  color: string;
  onPlanetClick?: (bodyId: BodyId) => void;
  onPlanetFly?: (bodyId: BodyId) => void;
  onBodyFly?: (bodyId: string) => void;
}

function PlanetMesh({
  planetId,
  name,
  radius,
  color,
  onPlanetClick,
  onPlanetFly,
  onBodyFly,
}: PlanetMeshProps) {
  const { ephemeris, currentTimeRef } = useScene();
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const sunDirectionRef = useRef(new THREE.Vector3(0, 1, 0));
  const visual = getPlanetVisual(planetId);

  const baseRadius = visualPlanetRadius(radius);
  const displayRadiusRef = useRef(baseRadius);
  const spinSpeed = visual?.spinSpeed ?? Math.PI * 2;
  const spinPhase = visual?.spinPhase ?? 0;
  const axialTilt = visual?.axialTilt ?? 0;
  const poleLongitude = visual?.poleLongitude ?? 0;

  useFrame((_state, _delta, frame) => {
    if (!groupRef.current || !bodyRef.current) return;
    const pos = resolvePlanetPosition(planetId, currentTimeRef.current, ephemeris);
    groupRef.current.position.copy(pos);

    // Sun sits at the origin of the floating-origin group.
    if (pos.lengthSq() > 0) {
      sunDirectionRef.current.copy(pos).negate().normalize();
    } else {
      sunDirectionRef.current.set(0, 1, 0);
    }

    if (spinRef.current) {
      const days = daysSinceJ2000(currentTimeRef.current);
      spinRef.current.rotation.y = spinPhase + days * spinSpeed;
    }

    const cameraDistance = camera.position.distanceTo(pos);
    const displayRadius = getDistanceScaledBodyRadius(baseRadius, cameraDistance);
    if (Math.abs(displayRadius - displayRadiusRef.current) > displayRadiusRef.current * 0.03) {
      const scale = displayRadius / baseRadius;
      bodyRef.current.scale.setScalar(scale);
      displayRadiusRef.current = displayRadius;
    }

    registerPlanetOccluder(planetId, pos, displayRadiusRef.current, camera, size, frame);
  });

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        <group rotation={[0, poleLongitude, 0]}>
          <group rotation={[axialTilt, 0, 0]}>
            <group ref={spinRef}>
              <mesh
                userData={{ bodyId: planetId }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlanetClick?.(planetId);
                }}
              >
                <sphereGeometry args={[baseRadius, 48, 48]} />
                <LitPlanetSurfaceMaterial
                  textureUrl={visual?.textureUrl}
                  fallbackColor={visual?.fallbackColor ?? color}
                  sunDirectionRef={sunDirectionRef}
                />
              </mesh>
              {planetId === "saturn" && visual?.hasRings && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[baseRadius * 1.3, baseRadius * 2.2, 64]} />
                  <meshBasicMaterial color="#C9B896" transparent opacity={0.4} side={THREE.DoubleSide} />
                </mesh>
              )}
            </group>
          </group>
        </group>
        <BodyLabel
          name={name}
          bodyRadius={baseRadius}
          onClick={onPlanetFly ? () => onPlanetFly(planetId) : undefined}
        />
      </group>
      <Moons
        parentId={planetId}
        onPlanetClick={onPlanetClick}
        onBodyFly={onBodyFly}
      />
    </group>
  );
}

interface PlanetsProps {
  onPlanetClick?: (bodyId: BodyId) => void;
  onPlanetFly?: (bodyId: BodyId) => void;
  onBodyFly?: (bodyId: string) => void;
}

export default function Planets({ onPlanetClick, onPlanetFly, onBodyFly }: PlanetsProps) {
  return (
    <group>
      {PLANETS.map((planet) => (
        <PlanetMesh
          key={planet.id}
          planetId={planet.id as BodyId}
          name={planet.name}
          radius={planet.radius}
          color={planet.color}
          onPlanetClick={onPlanetClick}
          onPlanetFly={onPlanetFly}
          onBodyFly={onBodyFly}
        />
      ))}
    </group>
  );
}
