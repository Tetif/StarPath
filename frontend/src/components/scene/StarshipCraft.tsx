import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useScene } from "../../context/SceneContext";
import type { TrajectoryKind } from "../../types";
import { CRAFT_RENDER_ORDER, getCraftDisplayRadius } from "../../lib/scaleMode";

const MODEL_URL = "/models/starship.glb";
const FALLBACK_COLOR = new THREE.Color(0xc5ced8);
/** Model nose points along +Y (Sketchfab Starship bbox). */
const MODEL_UP = new THREE.Vector3(0, 1, 0);

useGLTF.preload(MODEL_URL);

function toVisibleMaterial(mat: THREE.Material): THREE.Material {
  if (mat instanceof THREE.MeshBasicMaterial) {
    mat.fog = false;
    mat.toneMapped = false;
    if (mat.transparent && mat.opacity < 0.05) mat.opacity = 1;
    return mat;
  }

  const pbr = mat as THREE.MeshStandardMaterial;
  const color =
    pbr.color instanceof THREE.Color ? pbr.color.clone() : FALLBACK_COLOR.clone();

  return new THREE.MeshBasicMaterial({
    map: pbr.map ?? null,
    color,
    transparent: pbr.transparent,
    opacity: pbr.transparent ? Math.max(pbr.opacity, 0.35) : 1,
    alphaMap: pbr.alphaMap ?? null,
    alphaTest: pbr.alphaMap ? 0.4 : 0,
    side: pbr.side ?? THREE.DoubleSide,
    fog: false,
    toneMapped: false,
    depthWrite: true,
    depthTest: true,
  });
}

function prepareCraftModel(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.frustumCulled = false;
    const source = Array.isArray(obj.material) ? obj.material : [obj.material];
    const converted = source.map((mat) => toVisibleMaterial(mat));
    obj.material = converted.length === 1 ? converted[0] : converted;
  });
}

interface StarshipCraftProps {
  kind: TrajectoryKind;
}

export default function StarshipCraft({ kind }: StarshipCraftProps) {
  const { scene: gltfScene } = useGLTF(MODEL_URL);
  const { getCraftState, floatingOriginRef } = useScene();
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const modelRadiusRef = useRef(1);
  const localPos = useRef(new THREE.Vector3());
  const velocityDir = useRef(new THREE.Vector3());
  const orientQuat = useRef(new THREE.Quaternion());

  const model = useMemo(() => {
    const clone = gltfScene.clone(true) as THREE.Group;
    prepareCraftModel(clone);

    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center);

    return clone;
  }, [gltfScene]);

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(model);
    const sizeVec = box.getSize(new THREE.Vector3());
    modelRadiusRef.current = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1e-6) / 2;
  }, [model]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const state = getCraftState(kind);
    if (!state) {
      group.visible = false;
      return;
    }

    group.visible = true;
    localPos.current.copy(state.position).sub(floatingOriginRef.current);
    group.position.copy(localPos.current);

    if (state.velocity.lengthSq() > 1) {
      velocityDir.current.copy(state.velocity).normalize();
      orientQuat.current.setFromUnitVectors(MODEL_UP, velocityDir.current);
      group.quaternion.copy(orientQuat.current);
    }

    const cam = camera as THREE.PerspectiveCamera;
    const camDist = Math.max(camera.position.distanceTo(localPos.current), 1);
    const displayRadius = getCraftDisplayRadius(camDist, size.height, cam.fov);
    const scale = displayRadius / modelRadiusRef.current;
    group.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef} renderOrder={CRAFT_RENDER_ORDER}>
      <primitive object={model} />
    </group>
  );
}
