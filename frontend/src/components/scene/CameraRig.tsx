import { OrbitControls } from "@react-three/drei";

import { useFrame, useThree } from "@react-three/fiber";

import { useEffect, useRef } from "react";

import * as THREE from "three";

import { useScene, type CameraController } from "../../context/SceneContext";

import type { BodyId } from "../../types";
import type { CraftState } from "../../lib/czmlParser";
import { resolveBodyPosition } from "../../hooks/usePlanetPositions";

import {

  getCameraDistanceLimits,

  getSolarSystemOverviewDistance,

} from "../../lib/scaleMode";

import { boundingSphereFromPoints, craftChaseCameraOffset, flyToCameraPosition } from "../../lib/vectors";

const ZOOM_IN_FACTOR = 0.35;

const ZOOM_OUT_FACTOR = 2.8;

const SCENE_TARGET = new THREE.Vector3(0, 0, 0);

const CHASE_FOCUS_LERP = 0.2;

const CHASE_CAMERA_LERP = 0.12;

interface FlyAnimation {

  fromPos: THREE.Vector3;

  toPos: THREE.Vector3;

  fromFocus: THREE.Vector3;

  toFocus: THREE.Vector3;

  start: number;

  duration: number;

}

function defaultViewOffset(distance: number): THREE.Vector3 {

  return flyToCameraPosition(new THREE.Vector3(), distance).sub(new THREE.Vector3());

}

type OrbitControlsImpl = NonNullable<React.ComponentRef<typeof OrbitControls>> & {
  _sphericalDelta?: THREE.Spherical;
  _panOffset?: THREE.Vector3;
};

function syncOrbitTarget(

  targetRef: THREE.Vector3,

  controls: OrbitControlsImpl,

): void {

  targetRef.copy(SCENE_TARGET);

  controls.target.copy(SCENE_TARGET);

}

function resetOrbitControlDeltas(controls: OrbitControlsImpl): void {

  controls._sphericalDelta?.set(0, 0, 0);

  controls._panOffset?.set(0, 0, 0);

}

function startCameraFly(

  camera: THREE.Camera,

  flyRef: React.MutableRefObject<FlyAnimation | null>,

  focusOriginRef: THREE.Vector3,

  toFocus: THREE.Vector3,

  toPos: THREE.Vector3,

  duration: number,

): void {

  flyRef.current = {

    fromPos: camera.position.clone(),

    toPos,

    fromFocus: focusOriginRef.clone(),

    toFocus: toFocus.clone(),

    start: performance.now(),

    duration: duration * 1000,

  };

}

function applyCraftChaseCamera(

  camera: THREE.Camera,

  state: CraftState,

  desiredCamRef: THREE.Vector3,

  cameraLerp: number,

): void {

  craftChaseCameraOffset(state.velocity, desiredCamRef);

  camera.position.lerp(desiredCamRef, cameraLerp);

  camera.lookAt(SCENE_TARGET);

}

export default function CameraRig() {

  const {

    chaseKind,

    playing,

    focusedBodyIdRef,

    ephemeris,

    currentTimeRef,

    getCraftState,

    registerCamera,

    unregisterCamera,

    flyToPlanet: ctxFlyToPlanet,

    flyToBody: ctxFlyToBody,

    setFloatingOrigin,

  } = useScene();

  const { camera } = useThree();

  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const targetRef = useRef(new THREE.Vector3());

  const focusOriginRef = useRef(new THREE.Vector3());

  const flyRef = useRef<FlyAnimation | null>(null);

  const chaseDesiredPos = useRef(new THREE.Vector3());

  const chaseUserControlRef = useRef(false);

  const initializedRef = useRef(false);

  const limits = getCameraDistanceLimits();

  useEffect(() => {

    const getControls = () => controlsRef.current;

    const flyToTarget = (absoluteFocus: THREE.Vector3, distance: number, duration = 1.2) => {

      if (!getControls()) return;

      const dest = defaultViewOffset(distance);

      startCameraFly(

        camera,

        flyRef,

        focusOriginRef.current,

        absoluteFocus,

        dest,

        duration,

      );

    };

    const controller: CameraController = {

      flyToTarget,

      flyApproachTarget: (absoluteFocus, standoff, duration = 1.2) => {

        flyToTarget(absoluteFocus, standoff.preferredView, duration);

      },

      flyToPoints: (points, duration = 1.5) => {

        if (!getControls() || points.length === 0) return;

        const { center, radius } = boundingSphereFromPoints(points);

        const range = Math.max(radius * 2.5, limits.min * 4);

        flyToTarget(center, range, duration);

      },

      flyToPlanet: (bodyId: BodyId) => ctxFlyToPlanet(bodyId),

      flyToBody: (bodyId: string) => ctxFlyToBody(bodyId),

      zoom: (direction) => {

        const dist = camera.position.distanceTo(SCENE_TARGET);

        const factor = direction === "in" ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;

        const move = Math.max(dist * factor, limits.min * 0.5);

        const dir = camera.position.clone().sub(SCENE_TARGET).normalize();

        if (direction === "in") {

          camera.position.addScaledVector(dir, -move);

        } else {

          camera.position.addScaledVector(dir, move);

        }

      },

      setTarget: (absoluteFocus) => {

        focusOriginRef.current.copy(absoluteFocus);

        setFloatingOrigin(absoluteFocus);

        const controls = getControls();

        if (controls) syncOrbitTarget(targetRef.current, controls);

      },

      getTarget: () => focusOriginRef.current.clone(),

      snapCraftChase: (state) => {

        flyRef.current = null;

        chaseUserControlRef.current = false;

        focusOriginRef.current.copy(state.position);

        craftChaseCameraOffset(state.velocity, chaseDesiredPos.current);

        camera.position.copy(chaseDesiredPos.current);

        camera.lookAt(SCENE_TARGET);

        setFloatingOrigin(focusOriginRef.current);

        const controls = getControls();

        if (controls) {

          syncOrbitTarget(targetRef.current, controls);

          resetOrbitControlDeltas(controls);

          controls.update();

        }

      },

    };

    registerCamera(controller);

    return () => unregisterCamera();

  }, [camera, registerCamera, unregisterCamera, ctxFlyToPlanet, ctxFlyToBody, limits.min, setFloatingOrigin]);

  useEffect(() => {

    if (!chaseKind) chaseUserControlRef.current = false;

  }, [chaseKind]);

  useFrame(() => {

    const controls = controlsRef.current;

    if (!controls) return;

    if (!initializedRef.current) {

      const overviewDist = getSolarSystemOverviewDistance();

      focusOriginRef.current.set(0, 0, 0);

      syncOrbitTarget(targetRef.current, controls);

      camera.position.copy(flyToCameraPosition(SCENE_TARGET, overviewDist));

      setFloatingOrigin(focusOriginRef.current);

      initializedRef.current = true;

    }

    if (flyRef.current) {

      const anim = flyRef.current;

      const t = Math.min((performance.now() - anim.start) / anim.duration, 1);

      const eased = 1 - Math.pow(1 - t, 3);

      focusOriginRef.current.lerpVectors(anim.fromFocus, anim.toFocus, eased);

      camera.position.lerpVectors(anim.fromPos, anim.toPos, eased);

      syncOrbitTarget(targetRef.current, controls);

      if (t >= 1) flyRef.current = null;

    }

    if (chaseKind && !flyRef.current) {

      const state = getCraftState(chaseKind);

      if (state) {

        focusOriginRef.current.lerp(state.position, CHASE_FOCUS_LERP);

        syncOrbitTarget(targetRef.current, controls);

        if (!chaseUserControlRef.current) {

          applyCraftChaseCamera(

            camera,

            state,

            chaseDesiredPos.current,

            CHASE_CAMERA_LERP,

          );

        }

      }

    } else if (playing && !flyRef.current) {

      const bodyId = focusedBodyIdRef.current;

      if (bodyId) {

        const bodyPos = resolveBodyPosition(bodyId, currentTimeRef.current, ephemeris);

        focusOriginRef.current.lerp(bodyPos, CHASE_FOCUS_LERP);

        syncOrbitTarget(targetRef.current, controls);

      }

    }

    setFloatingOrigin(focusOriginRef.current);

  }, -1);

  return (

    <OrbitControls

      ref={controlsRef}

      makeDefault

      target={[0, 0, 0]}

      minDistance={limits.min}

      maxDistance={limits.max}

      enablePan={!chaseKind}

      onStart={() => {

        if (chaseKind) chaseUserControlRef.current = true;

      }}

      onEnd={() => {

        const controls = controlsRef.current;

        if (!controls) return;

        // Pan keeps gliding after mouse up while enableDamping is on (drei default).

        resetOrbitControlDeltas(controls as OrbitControlsImpl);

      }}

      mouseButtons={{

        LEFT: THREE.MOUSE.ROTATE,

        MIDDLE: THREE.MOUSE.DOLLY,

        RIGHT: THREE.MOUSE.PAN,

      }}

    />

  );

}
