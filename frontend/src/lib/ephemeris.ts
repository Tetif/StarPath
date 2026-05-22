import * as THREE from "three";



import type { BodyId } from "../types";

import { request } from "./api";

import { addSeconds, parseIso } from "./time";



export interface EphemerisSample {

  epoch: string;

  cartesian: number[];

}



export interface EphemerisData {

  epoch: string;

  bodies: Record<string, EphemerisSample>;

}



export interface SampledTrack {

  times: Date[];

  positions: THREE.Vector3[];

}



const cache = new Map<string, EphemerisData>();



function cacheKey(from: string, to: string, stepHours: number): string {

  return `${from}|${to}|${stepHours}`;

}



export async function fetchEphemerisSample(

  from: string,

  to: string,

  stepHours = 24,

): Promise<EphemerisData> {

  const key = cacheKey(from, to, stepHours);

  const hit = cache.get(key);

  if (hit) return hit;



  const params = new URLSearchParams({

    from,

    to,

    step_hours: String(stepHours),

    bodies: "mercury,venus,earth,mars,moon,jupiter,saturn,uranus,neptune",

  });

  const data = await request<EphemerisData>(`/api/v1/ephemeris/sample?${params}`);

  cache.set(key, data);

  return data;

}



function cartesianToTrack(epoch: string, cartesian: number[]): SampledTrack {

  const times: Date[] = [];

  const positions: THREE.Vector3[] = [];

  const epochDate = parseIso(epoch);



  for (let i = 0; i < cartesian.length; i += 4) {

    const dt = cartesian[i];

    const x = cartesian[i + 1];

    const y = cartesian[i + 2];

    const z = cartesian[i + 3];

    times.push(addSeconds(epochDate, dt));

    positions.push(new THREE.Vector3(x, y, z));

  }



  return { times, positions };

}



export function buildSampledTrack(

  bodyId: BodyId,

  data: EphemerisData | null,

): SampledTrack | null {

  if (!data?.bodies[bodyId]) return null;



  const sample = data.bodies[bodyId];

  const track = cartesianToTrack(sample.epoch, sample.cartesian);

  if (track.times.length === 0) return null;

  return track;

}



export function getPositionAtTime(track: SampledTrack, time: Date): THREE.Vector3 | null {

  const { times, positions } = track;

  if (times.length === 0) return null;

  if (times.length === 1) return positions[0].clone();



  const tMs = time.getTime();



  if (tMs <= times[0].getTime()) return positions[0].clone();

  if (tMs >= times[times.length - 1].getTime()) return positions[positions.length - 1].clone();



  for (let i = 0; i < times.length - 1; i++) {

    const t0 = times[i].getTime();

    const t1 = times[i + 1].getTime();

    if (tMs >= t0 && tMs <= t1) {

      const alpha = (tMs - t0) / (t1 - t0);

      return positions[i].clone().lerp(positions[i + 1], alpha);

    }

  }



  return positions[positions.length - 1].clone();

}



/** Close the polyline when samples cover most of an orbit. */

export function closeOrbitLoop(points: THREE.Vector3[]): THREE.Vector3[] {

  if (points.length < 3) return points.map((p) => p.clone());

  const closed = points.map((p) => p.clone());

  const first = closed[0];

  const last = closed[closed.length - 1];

  const gap = first.distanceTo(last);

  const avgRadius =

    closed.reduce((sum, p) => sum + p.length(), 0) / Math.max(closed.length, 1);

  if (gap < avgRadius * 0.15) closed.push(first.clone());

  return closed;

}



function subsamplePositions(positions: THREE.Vector3[], maxPoints: number): THREE.Vector3[] {

  if (positions.length <= maxPoints) return positions.map((p) => p.clone());

  const result: THREE.Vector3[] = [];

  const step = (positions.length - 1) / (maxPoints - 1);

  for (let i = 0; i < maxPoints; i++) {

    result.push(positions[Math.round(i * step)].clone());

  }

  return result;

}



/** Build a 3D orbit outline from an ephemeris track (matches planet motion). */

export function buildOrbitPathFromTrack(track: SampledTrack, maxPoints = 256): THREE.Vector3[] {

  if (track.positions.length === 0) return [];

  return closeOrbitLoop(subsamplePositions(track.positions, maxPoints));

}



export function getMissionTimeRange(results: {

  trajectories?: Record<string, { metrics: { departure_epoch: string; arrival_epoch: string } }>;

} | null): { from: string; to: string } | null {

  if (!results?.trajectories) return null;



  let minDep = Infinity;

  let maxArr = -Infinity;

  let fromIso = "";

  let toIso = "";



  for (const traj of Object.values(results.trajectories)) {

    const dep = Date.parse(traj.metrics.departure_epoch);

    const arr = Date.parse(traj.metrics.arrival_epoch);

    if (dep < minDep) {

      minDep = dep;

      fromIso = traj.metrics.departure_epoch;

    }

    if (arr > maxArr) {

      maxArr = arr;

      toIso = traj.metrics.arrival_epoch;

    }

  }



  if (!fromIso || !toIso) return null;



  const padBefore = new Date(minDep - 30 * 86400000).toISOString();

  const padAfter = new Date(maxArr + 30 * 86400000).toISOString();

  return { from: padBefore, to: padAfter };

}



export function getEphemerisTimeRange(data: EphemerisData): { start: Date; stop: Date } | null {

  let minMs = Infinity;

  let maxMs = -Infinity;



  for (const sample of Object.values(data.bodies)) {

    const epochDate = parseIso(sample.epoch);

    const cartesian = sample.cartesian;

    for (let i = 0; i < cartesian.length; i += 4) {

      const t = addSeconds(epochDate, cartesian[i]).getTime();

      if (t < minMs) minMs = t;

      if (t > maxMs) maxMs = t;

    }

  }



  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;

  return { start: new Date(minMs), stop: new Date(maxMs) };

}



export function getEphemerisPositionAtTime(

  bodyId: BodyId,

  data: EphemerisData | null,

  time: Date,

): THREE.Vector3 | null {

  const track = buildSampledTrack(bodyId, data);

  if (!track) return null;

  return getPositionAtTime(track, time);

}


