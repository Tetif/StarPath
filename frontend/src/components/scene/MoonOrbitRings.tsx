import { useFrame, useThree } from "@react-three/fiber";

import { useMemo, useRef } from "react";
import * as THREE from "three";



import { useScene } from "../../context/SceneContext";

import { buildMoonOrbitPathLocal, resolvePlanetPosition } from "../../hooks/usePlanetPositions";

import { MOONS, type MoonDefinition } from "../../lib/bodies";

import {
  getDistanceScaledBodyRadius,
  getMoonOrbitDisplayScale,
  PLANETS,
  visualPlanetRadius,
} from "../../lib/scaleMode";

import OrbitOutline from "./OrbitOutline";



interface MoonOrbitRingProps {

  moon: MoonDefinition;

}



function MoonOrbitRing({ moon }: MoonOrbitRingProps) {

  const { ephemeris, currentTimeRef, currentTime } = useScene();

  const { camera } = useThree();

  const groupRef = useRef<THREE.Group>(null);

  const ringRef = useRef<THREE.Group>(null);



  const segments = moon.id === "moon" ? 256 : 128;

  const anchorHour = Math.floor(currentTime.getTime() / 3_600_000);

  const orbitAnchor = useMemo(() => new Date(anchorHour * 3_600_000), [anchorHour]);



  const localPoints = useMemo(

    () => buildMoonOrbitPathLocal(moon, ephemeris, orbitAnchor, segments),

    [moon, ephemeris, orbitAnchor, segments],

  );



  useFrame(() => {

    if (!groupRef.current) return;

    const parentPos = resolvePlanetPosition(

      moon.parentId,

      currentTimeRef.current,

      ephemeris,

    );

    groupRef.current.position.copy(parentPos);

    if (!ringRef.current) return;

    const parentPlanet = PLANETS.find((p) => p.id === moon.parentId);

    const parentBaseRadius = parentPlanet ? visualPlanetRadius(parentPlanet.radius) : 0;

    const parentDisplayRadius = getDistanceScaledBodyRadius(

      parentBaseRadius,

      camera.position.distanceTo(parentPos),

    );

    const scale = getMoonOrbitDisplayScale(moon, parentDisplayRadius);

    ringRef.current.scale.setScalar(scale);

  });



  const isEarthMoon = moon.id === "moon";



  return (

    <group ref={groupRef}>

      <group ref={ringRef}>

        <OrbitOutline

          points={localPoints}

          color={moon.color}

          opacity={isEarthMoon ? 0.42 : 0.34}

          lineWidth={isEarthMoon ? 2.5 : 1.5}

        />

      </group>

    </group>

  );

}



export default function MoonOrbitRings() {

  return (

    <group>

      {MOONS.map((moon) => (

        <MoonOrbitRing key={moon.id} moon={moon} />

      ))}

    </group>

  );

}


