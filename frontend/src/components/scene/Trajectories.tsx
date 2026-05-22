import { Line, useCursor } from "@react-three/drei";

import { useFrame, type ThreeEvent } from "@react-three/fiber";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import * as THREE from "three";

import type { Line2, LineGeometry } from "three-stdlib";



import { useScene } from "../../context/SceneContext";

import type { TrajectoryKind } from "../../types";

import { TRAJECTORY_COLORS, TRAJECTORY_GLOW, TRAJECTORY_LINE_RENDER_ORDER } from "../../lib/scaleMode";

import StarshipCraft from "./StarshipCraft";



const KINDS: TrajectoryKind[] = ["fastest", "cheapest", "balanced"];



const TRAJECTORY_GLOW_RENDER_ORDER = TRAJECTORY_LINE_RENDER_ORDER;

const TRAJECTORY_CORE_RENDER_ORDER = TRAJECTORY_LINE_RENDER_ORDER + 1;

const TRAJECTORY_PICK_RENDER_ORDER = TRAJECTORY_CORE_RENDER_ORDER + 2;

const PICK_LINE_WIDTH = 18;



/** Outside FloatingOrigin — avoids jitter at 1e11 m local coords. */

export function StarshipCrafts() {

  const { trajectoriesLoading, vehicleId, visibleTrajectories } = useScene();



  if (trajectoriesLoading || vehicleId !== "starship") return null;



  return (

    <>

      {KINDS.filter((k) => visibleTrajectories[k]).map((kind) => (

        <StarshipCraft key={`craft-${kind}`} kind={kind} />

      ))}

    </>

  );

}



function updateLinePositions(line: Line2 | null, buf: Float32Array) {

  const geom = line?.geometry as LineGeometry | undefined;

  if (!geom?.setPositions) return;

  geom.setPositions(buf);

  line?.computeLineDistances();

}



function FlybyMarker({ absolutePos, color }: { absolutePos: THREE.Vector3; color: string }) {

  const { floatingOriginRef } = useScene();

  const meshRef = useRef<THREE.Mesh>(null);

  const localPos = useRef(new THREE.Vector3());



  useFrame(() => {

    const mesh = meshRef.current;

    if (!mesh) return;

    localPos.current.copy(absolutePos).sub(floatingOriginRef.current);

    mesh.position.copy(localPos.current);

  });



  return (

    <mesh ref={meshRef} frustumCulled={false} renderOrder={TRAJECTORY_CORE_RENDER_ORDER}>

      <ringGeometry args={[80000, 120000, 16]} />

      <meshBasicMaterial

        color={color}

        transparent

        opacity={0.6}

        fog={false}

        side={THREE.DoubleSide}

        depthWrite={false}

      />

    </mesh>

  );

}



function TrajectoryLine({ kind }: { kind: TrajectoryKind }) {

  const {
    trajectories,
    visibleTrajectories,
    floatingOriginRef,
    activeKind,
    selectTrajectory,
  } = useScene();

  const traj = trajectories[kind];

  const visible = visibleTrajectories[kind];



  const glowRef = useRef<Line2>(null);

  const coreRef = useRef<Line2>(null);

  const pickRef = useRef<Line2>(null);

  const [hovered, setHovered] = useState(false);

  useCursor(hovered && visible);

  const positionsBuf = useRef<Float32Array | null>(null);



  const flybyMarkers = useMemo(() => {

    if (!traj || traj.samples.length < 4) return [];

    const markers: THREE.Vector3[] = [];

    const step = Math.max(1, Math.floor(traj.samples.length / 8));

    for (let i = step; i < traj.samples.length - step; i += step) {

      markers.push(traj.samples[i].position.clone());

    }

    return markers.slice(0, 6);

  }, [traj]);



  const stablePoints = useMemo(() => {

    if (!traj) return [];

    return traj.polyline.map((p) => p.clone());

  }, [traj]);



  useLayoutEffect(() => {

    if (!traj) {

      positionsBuf.current = null;

      return;

    }

    positionsBuf.current = new Float32Array(traj.polyline.length * 3);

  }, [traj]);



  useFrame(() => {

    if (!traj) return;

    const buf = positionsBuf.current;

    if (!buf) return;



    const origin = floatingOriginRef.current;

    const polyline = traj.polyline;

    for (let i = 0; i < polyline.length; i++) {

      const p = polyline[i];

      const j = i * 3;

      buf[j] = p.x - origin.x;

      buf[j + 1] = p.y - origin.y;

      buf[j + 2] = p.z - origin.z;

    }



    updateLinePositions(glowRef.current, buf);

    updateLinePositions(coreRef.current, buf);

    updateLinePositions(pickRef.current, buf);

  });



  if (!traj || !visible) return null;



  const color = TRAJECTORY_COLORS[kind] ?? "#FFFFFF";

  const glow = TRAJECTORY_GLOW[kind] ?? color;

  const selected = activeKind === kind;

  const lineWidth = selected ? 2.5 : 1.5;

  const coreOpacity = selected ? 1 : 0.65;

  const glowOpacity = selected ? 0.55 : 0.35;

  const handleSelect = (e: ThreeEvent<MouseEvent>) => {

    e.stopPropagation();

    selectTrajectory(kind);

  };



  return (

    <group>

      <Line

        ref={pickRef}

        points={stablePoints}

        color={color}

        transparent

        opacity={0.01}

        lineWidth={PICK_LINE_WIDTH}

        fog={false}

        renderOrder={TRAJECTORY_PICK_RENDER_ORDER}

        depthWrite={false}

        onClick={handleSelect}

        onPointerOver={(e) => {

          e.stopPropagation();

          setHovered(true);

        }}

        onPointerOut={() => setHovered(false)}

      />

      <Line

        ref={glowRef}

        raycast={() => null}

        points={stablePoints}

        color={glow}

        transparent

        opacity={glowOpacity}

        lineWidth={lineWidth + 1}

        fog={false}

        renderOrder={TRAJECTORY_GLOW_RENDER_ORDER}

        depthWrite={false}

        polygonOffset

        polygonOffsetFactor={-1}

        polygonOffsetUnits={-1}

      />

      <Line

        ref={coreRef}

        raycast={() => null}

        points={stablePoints}

        color={color}

        lineWidth={lineWidth}

        transparent

        opacity={coreOpacity}

        fog={false}

        renderOrder={TRAJECTORY_CORE_RENDER_ORDER}

        depthWrite

        depthTest

      />

      {flybyMarkers.map((pos, idx) => (

        <FlybyMarker key={idx} absolutePos={pos} color={color} />

      ))}

    </group>

  );

}



export default function Trajectories() {

  const { trajectoriesLoading } = useScene();



  if (trajectoriesLoading) return null;



  return (

    <group>

      {KINDS.map((kind) => (

        <TrajectoryLine key={kind} kind={kind} />

      ))}

    </group>

  );

}


