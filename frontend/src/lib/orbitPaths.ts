import * as THREE from "three";

import type { BodyId } from "../types";
import {
  buildSampledTrack,
  type EphemerisData,
} from "./ephemeris";
import { getPlanetPosition, PLANET_ORBIT_PERIOD_DAYS } from "./scaleMode";
import { J2000 } from "./time";

export const PLANET_ORBIT_RING_SEGMENTS = 256;

export interface PlanetOrbitRingData {
  points: THREE.Vector3[];
  sampleTimes: Date[];
  closed: boolean;
}

function buildSampleTimes(bodyId: BodyId, segments: number): Date[] {
  const periodDays = PLANET_ORBIT_PERIOD_DAYS[bodyId] ?? 365.25;
  const sampleTimes: Date[] = [];

  for (let i = 0; i < segments; i++) {
    const dayOffset = (i / segments) * periodDays;
    sampleTimes.push(new Date(J2000.getTime() + dayOffset * 86400000));
  }

  return sampleTimes;
}

function isUsablePosition(point: THREE.Vector3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function getFallbackOrbitSamples(bodyId: BodyId, segments: number): THREE.Vector3[] {
  const periodDays = PLANET_ORBIT_PERIOD_DAYS[bodyId] ?? 365.25;
  const samples: THREE.Vector3[] = [];

  for (let i = 0; i < segments; i++) {
    const dayOffset = (i / segments) * periodDays;
    const t = new Date(J2000.getTime() + dayOffset * 86400000);
    samples.push(getPlanetPosition(bodyId, t));
  }

  return samples;
}

function getOrbitSamples(
  bodyId: BodyId,
  ephemeris: EphemerisData | null,
  segments: number,
): THREE.Vector3[] {
  const track = buildSampledTrack(bodyId, ephemeris);
  const samples = track?.positions.filter(isUsablePosition) ?? [];
  return samples.length >= 3 ? samples : getFallbackOrbitSamples(bodyId, segments);
}

function projectOntoPlane(point: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  return point.clone().addScaledVector(normal, -point.dot(normal));
}

function estimateOrbitNormal(samples: THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();

  for (let i = 0; i < samples.length - 1; i++) {
    normal.add(_normalCross.crossVectors(samples[i], samples[i + 1]));
  }

  if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
  return normal.normalize();
}

function buildEllipseOrbitRing(
  bodyId: BodyId,
  ephemeris: EphemerisData | null,
  segments: number,
): PlanetOrbitRingData {
  const samples = getOrbitSamples(bodyId, ephemeris, segments);
  const normal = estimateOrbitNormal(samples);

  let perihelion = samples[0];
  let rMin = Infinity;
  let rMax = 0;

  for (const sample of samples) {
    const radius = sample.length();
    if (radius < rMin) {
      rMin = radius;
      perihelion = sample;
    }
    if (radius > rMax) rMax = radius;
  }

  const semiMajor = Math.max((rMin + rMax) / 2, 1);
  const eccentricity = Math.min(0.45, Math.max(0, (rMax - rMin) / (rMax + rMin)));
  const semiLatusRectum = semiMajor * (1 - eccentricity * eccentricity);

  const periAxis = projectOntoPlane(perihelion, normal);
  if (periAxis.lengthSq() < 1e-12) periAxis.set(1, 0, 0);
  periAxis.normalize();

  const crossAxis = new THREE.Vector3().crossVectors(normal, periAxis).normalize();
  const points: THREE.Vector3[] = [];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const radius =
      eccentricity > 1e-4
        ? semiLatusRectum / (1 + eccentricity * Math.cos(theta))
        : semiMajor;

    points.push(
      periAxis
        .clone()
        .multiplyScalar(Math.cos(theta) * radius)
        .addScaledVector(crossAxis, Math.sin(theta) * radius),
    );
  }

  return { points, sampleTimes: buildSampleTimes(bodyId, segments), closed: true };
}

const _normalCross = new THREE.Vector3();

export function buildPlanetOrbitRingData(
  bodyId: BodyId,
  ephemeris: EphemerisData | null,
  segments = PLANET_ORBIT_RING_SEGMENTS,
): PlanetOrbitRingData {
  return buildEllipseOrbitRing(bodyId, ephemeris, segments);
}

/** @deprecated Use `buildPlanetOrbitRingData`. */
export function buildPlanetOrbitRing(
  bodyId: BodyId,
  ephemeris: EphemerisData | null,
  segments = PLANET_ORBIT_RING_SEGMENTS,
): THREE.Vector3[] {
  return buildPlanetOrbitRingData(bodyId, ephemeris, segments).points;
}

function getOrbitPhaseFromTimes(sampleTimes: Date[], time: Date): number {
  if (sampleTimes.length === 0) return 0;
  if (sampleTimes.length === 1) return 0;

  const t = time.getTime();
  const t0 = sampleTimes[0].getTime();
  const tLast = sampleTimes[sampleTimes.length - 1].getTime();

  if (t <= t0) return 0;
  if (t >= tLast) return sampleTimes.length - 1;

  let lo = 0;
  let hi = sampleTimes.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (sampleTimes[mid].getTime() <= t) lo = mid;
    else hi = mid;
  }

  const dt = sampleTimes[hi].getTime() - sampleTimes[lo].getTime();
  if (dt <= 0) return lo;
  const alpha = (t - sampleTimes[lo].getTime()) / dt;
  return lo + alpha;
}

function projectPointOnSegment(
  point: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
): { t: number; distSq: number } {
  const ab = _segAb.subVectors(b, a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-18) {
    return { t: 0, distSq: point.distanceToSquared(a) };
  }
  const t = Math.min(1, Math.max(0, _segAp.subVectors(point, a).dot(ab) / lenSq));
  _segClosest.copy(a).addScaledVector(ab, t);
  return { t, distSq: point.distanceToSquared(_segClosest) };
}

const _segAb = new THREE.Vector3();
const _segAp = new THREE.Vector3();
const _segClosest = new THREE.Vector3();

function refineAnchorPhaseByPosition(
  points: THREE.Vector3[],
  planetPosition: THREE.Vector3,
  hintPhase: number,
  closed: boolean,
): number {
  const n = points.length;
  if (n < 2) return 0;

  let bestPhase = hintPhase;
  let bestDist = Infinity;
  const hasDuplicateEndpoint = points[0].distanceToSquared(points[n - 1]) < 1e-12;
  const segmentCount = closed && !hasDuplicateEndpoint ? n : n - 1;

  for (let i = 0; i < segmentCount; i++) {
    const j = closed ? (i + 1) % n : i + 1;
    if (!closed && j >= n) continue;

    const { t, distSq } = projectPointOnSegment(planetPosition, points[i], points[j]);
    if (distSq < bestDist) {
      bestDist = distSq;
      bestPhase = i + t;
      if (closed && j === 0 && i === n - 1) {
        bestPhase = n - 1 + t;
      }
    }
  }

  return bestPhase;
}

/**
 * Continuous anchor along the ring (0 … n−1), interpolated by time and
 * refined to the nearest orbit segment under the planet.
 */
export function getOrbitAnchorPhase(
  ring: PlanetOrbitRingData,
  time: Date,
  planetPosition: THREE.Vector3,
): number {
  const timePhase = getOrbitPhaseFromTimes(ring.sampleTimes, time);
  return refineAnchorPhaseByPosition(
    ring.points,
    planetPosition,
    timePhase,
    ring.closed,
  );
}

/** Whether the planet moves toward higher ring indices (+1) or lower (−1). */
export function getOrbitMotionForwardSign(
  ring: PlanetOrbitRingData,
  time: Date,
  planetPosition: THREE.Vector3,
  planetPositionAhead: THREE.Vector3,
): number {
  const count = ring.points.length;
  if (count < 2) return 1;

  const phase0 = getOrbitAnchorPhase(ring, time, planetPosition);
  const phase1 = getOrbitAnchorPhase(ring, time, planetPositionAhead);

  let delta = phase1 - phase0;
  const half = count / 2;
  if (delta > half) delta -= count;
  if (delta < -half) delta += count;

  return delta >= 0 ? 1 : -1;
}

/** Anchor vertex aligned to simulation time and planet position on the ring. */
export function getOrbitAnchorIndex(
  ring: PlanetOrbitRingData,
  time: Date,
  planetPosition: THREE.Vector3,
): number {
  const phase = getOrbitAnchorPhase(ring, time, planetPosition);
  const n = ring.points.length;
  if (n === 0) return 0;
  return Math.round(phase) % n;
}
