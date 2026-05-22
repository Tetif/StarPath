import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";

import { useScene } from "../../context/SceneContext";

interface FloatingOriginProps {
  children: ReactNode;
}

export default function FloatingOrigin({ children }: FloatingOriginProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { floatingOriginRef } = useScene();

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.copy(floatingOriginRef.current).negate();
  });

  return <group ref={groupRef}>{children}</group>;
}
