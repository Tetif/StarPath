import type { Camera } from "three";
import * as THREE from "three";

import type { BodyId } from "../types";

export type PlanetScreenDisc = {
  cx: number;
  cy: number;
  radiusPx: number;
  cameraDistance: number;
};

const DISC_PADDING_PX = 4;
/** Minimum opacity multiplier when moon label is fully over the parent planet disc. */
const MIN_VISIBILITY = 0.001;

let occluderFrame = -1;
const planetDiscs = new Map<BodyId, PlanetScreenDisc>();

function ensureOccluderFrame(frame: number): void {
  if (occluderFrame === frame) return;
  occluderFrame = frame;
  planetDiscs.clear();
}

function circleRectOverlapRatio(labelRect: DOMRect, disc: PlanetScreenDisc): number {
  const { cx, cy, radiusPx: r } = disc;
  const rSq = r * r;

  const xs = [labelRect.left, labelRect.left + labelRect.width * 0.5, labelRect.right];
  const ys = [labelRect.top, labelRect.top + labelRect.height * 0.5, labelRect.bottom];

  let inside = 0;
  let total = 0;
  for (const x of xs) {
    for (const y of ys) {
      total++;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rSq) inside++;
    }
  }

  return inside / Math.max(total, 1);
}

function worldToScreenDisc(
  worldPos: THREE.Vector3,
  worldRadius: number,
  camera: THREE.PerspectiveCamera,
  size: { width: number; height: number },
): PlanetScreenDisc | null {
  const dist = camera.position.distanceTo(worldPos);
  if (dist <= 0 || worldRadius <= 0) return null;

  const projected = worldPos.clone().project(camera);
  if (projected.z > 1) return null;

  const cx = (projected.x * 0.5 + 0.5) * size.width;
  const cy = (-projected.y * 0.5 + 0.5) * size.height;

  const vFov = (camera.fov * Math.PI) / 180;
  const projFactor = size.height / (2 * Math.tan(vFov / 2));
  const radiusPx = (worldRadius / dist) * projFactor + DISC_PADDING_PX;

  return { cx, cy, radiusPx, cameraDistance: dist };
}

/** Register parent planet screen disc for moon label dimming (once per frame per body). */
export function registerPlanetOccluder(
  bodyId: BodyId,
  worldPos: THREE.Vector3,
  worldRadius: number,
  camera: Camera,
  size: { width: number; height: number },
  frame: number,
): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;

  ensureOccluderFrame(frame);
  const disc = worldToScreenDisc(worldPos, worldRadius, camera, size);
  if (disc) planetDiscs.set(bodyId, disc);
}

/**
 * Returns 1 when clear, down to MIN_VISIBILITY when moon label overlaps the parent
 * planet disc and the planet is closer to the camera than the label.
 */
export function getPlanetLabelOcclusionFactor(
  element: HTMLElement,
  labelCameraDistance: number,
  occludedBy: BodyId,
  frame: number,
): number {
  ensureOccluderFrame(frame);
  const disc = planetDiscs.get(occludedBy);
  if (!disc) return 1;

  if (disc.cameraDistance >= labelCameraDistance) return 1;

  const overlap = circleRectOverlapRatio(element.getBoundingClientRect(), disc);
  if (overlap <= 0) return 1;

  return 1 - overlap * (1 - MIN_VISIBILITY);
}
