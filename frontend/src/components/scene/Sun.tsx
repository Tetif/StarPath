import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { BodyId } from "../../types";
import { useScene } from "../../context/SceneContext";
import { getPlanetVisual } from "../../lib/planetAssets";
import { SunSurfaceMaterial } from "../../lib/planetTexture";
import { getSunDisplayRadius, visualSunRadius } from "../../lib/scaleMode";
import { daysSinceJ2000 } from "../../lib/time";
import BodyLabel from "./BodyLabel";

interface SunProps {
  onPlanetClick?: (bodyId: BodyId) => void;
  onPlanetFly?: (bodyId: BodyId) => void;
}

export default function Sun({ onPlanetClick, onPlanetFly }: SunProps) {
  const { currentTimeRef } = useScene();
  const sunVisual = getPlanetVisual("sun");
  const { camera } = useThree();

  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const worldPosRef = useRef(new THREE.Vector3());

  const baseRadius = visualSunRadius();
  const displayRadiusRef = useRef(baseRadius);
  const spinSpeed = sunVisual?.spinSpeed ?? 0;
  const spinPhase = sunVisual?.spinPhase ?? 0;

  useFrame(() => {
    if (!groupRef.current || !bodyRef.current) return;

    groupRef.current.getWorldPosition(worldPosRef.current);
    const cameraDistance = camera.position.distanceTo(worldPosRef.current);
    const displayRadius = getSunDisplayRadius(cameraDistance);
    if (Math.abs(displayRadius - displayRadiusRef.current) > displayRadiusRef.current * 0.03) {
      const scale = displayRadius / baseRadius;
      bodyRef.current.scale.setScalar(scale);
      displayRadiusRef.current = displayRadius;
    }

    if (spinRef.current && spinSpeed !== 0) {
      const days = daysSinceJ2000(currentTimeRef.current);
      spinRef.current.rotation.y = spinPhase + days * spinSpeed;
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        {/* Thin back-face corona only — a large transparent shell would render on top of
            nearby inner planets and wash them out (transparent pass runs after opaque). */}
        <mesh raycast={() => null}>
          <sphereGeometry args={[baseRadius * 1.12, 32, 32]} />
          <meshBasicMaterial
            color="#FFAA00"
            transparent
            opacity={0.1}
            side={THREE.BackSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <group ref={spinRef}>
          <mesh
            renderOrder={2}
            userData={{ bodyId: "sun" }}
            onClick={(e) => {
              e.stopPropagation();
              onPlanetClick?.("sun");
            }}
          >
            <sphereGeometry args={[baseRadius, 48, 48]} />
            <SunSurfaceMaterial
              textureUrl={sunVisual?.textureUrl}
              fallbackColor={sunVisual?.fallbackColor ?? "#FDB813"}
            />
          </mesh>
        </group>
        <BodyLabel
          name="Sun"
          bodyRadius={baseRadius}
          persistent
          onClick={onPlanetFly ? () => onPlanetFly("sun") : undefined}
        />
      </group>
    </group>
  );
}
