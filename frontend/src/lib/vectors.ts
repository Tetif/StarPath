import * as THREE from "three";

import {
  CRAFT_CHASE_DISTANCE_M,
  CRAFT_CHASE_HEIGHT_FACTOR,
} from "./scaleMode";



export { THREE };



export function toVector3(x: number, y: number, z: number): THREE.Vector3 {

  return new THREE.Vector3(x, y, z);

}



export function vecFromArray(arr: number[]): THREE.Vector3 {

  return new THREE.Vector3(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0);

}



export function boundingSphereFromPoints(points: THREE.Vector3[]): {

  center: THREE.Vector3;

  radius: number;

} {

  if (points.length === 0) {

    return { center: new THREE.Vector3(), radius: 1e10 };

  }

  const box = new THREE.Box3().setFromPoints(points);

  const center = new THREE.Vector3();

  const size = new THREE.Vector3();

  box.getCenter(center);

  box.getSize(size);

  const radius = Math.max(size.x, size.y, size.z) * 0.5;

  return { center, radius: Math.max(radius, 1e7) };

}



/** Camera offset matching legacy Cesium flyToBoundingSphere (heading=0, pitch=-0.45). */

export function flyToCameraPosition(

  center: THREE.Vector3,

  range: number,

): THREE.Vector3 {

  const pitch = -0.45;

  const heading = 0;

  const cosPitch = Math.cos(pitch);

  const sinPitch = Math.sin(pitch);

  const cosHeading = Math.cos(heading);

  const sinHeading = Math.sin(heading);



  const offset = new THREE.Vector3(

    range * cosPitch * sinHeading,

    range * sinPitch,

    range * cosPitch * cosHeading,

  );

  return center.clone().add(offset);

}



export function lerpVector3(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {

  return a.clone().lerp(b, t);

}

const _chaseBehind = new THREE.Vector3();
const _chaseWorldUp = new THREE.Vector3(0, 1, 0);
const _chaseRight = new THREE.Vector3();
const _chaseCamUp = new THREE.Vector3();

/** Camera position in floating-origin space (craft at origin) for chase view. */
export function craftChaseCameraOffset(
  velocity: THREE.Vector3,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  if (velocity.lengthSq() > 1) {
    _chaseBehind.copy(velocity).normalize().negate();
  } else {
    _chaseBehind.set(0, 0, -1);
  }

  _chaseRight.crossVectors(_chaseBehind, _chaseWorldUp);
  if (_chaseRight.lengthSq() < 1e-8) {
    _chaseRight.set(1, 0, 0);
  } else {
    _chaseRight.normalize();
  }

  _chaseCamUp.crossVectors(_chaseRight, _chaseBehind).normalize();

  return target
    .copy(_chaseBehind)
    .multiplyScalar(CRAFT_CHASE_DISTANCE_M)
    .addScaledVector(_chaseCamUp, CRAFT_CHASE_DISTANCE_M * CRAFT_CHASE_HEIGHT_FACTOR);
}


