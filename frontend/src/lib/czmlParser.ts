import * as THREE from "three";

import type { TrajectoryKind } from "../types";
import { czmlUrl } from "./api";
import { addSeconds, parseIso, secondsBetween } from "./time";

export interface TrajectorySample {
  time: Date;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

export interface ParsedTrajectory {
  kind: TrajectoryKind;
  epoch: Date;
  samples: TrajectorySample[];
  polyline: THREE.Vector3[];
  timeRange: { start: Date; stop: Date };
}

interface CzmlPosition {
  epoch?: string;
  cartesian?: number[];
  cartesianVelocity?: number[];
}

interface CzmlPacket {
  id?: string;
  position?: CzmlPosition;
}

const POLYLINE_STEPS = 400;

function enrichSampleVelocities(samples: TrajectorySample[]): TrajectorySample[] {
  if (samples.length < 2) return samples;
  const hasVelocity = samples.some((s) => s.velocity.lengthSq() > 1e-6);
  if (hasVelocity) return samples;

  return samples.map((sample, i) => {
    const prev = samples[Math.max(i - 1, 0)];
    const next = samples[Math.min(i + 1, samples.length - 1)];
    const dt = (next.time.getTime() - prev.time.getTime()) / 1000;
    if (dt <= 0) return sample;
    const velocity = next.position.clone().sub(prev.position).divideScalar(dt);
    return { ...sample, velocity };
  });
}

function parseCartesianSamples(epoch: string, values: number[], stride: 4 | 7): TrajectorySample[] {
  const epochDate = parseIso(epoch);
  const samples: TrajectorySample[] = [];

  for (let i = 0; i < values.length; i += stride) {
    const dt = values[i];
    const x = values[i + 1];
    const y = values[i + 2];
    const z = values[i + 3];
    const vx = stride === 7 ? values[i + 4] : 0;
    const vy = stride === 7 ? values[i + 5] : 0;
    const vz = stride === 7 ? values[i + 6] : 0;
    samples.push({
      time: addSeconds(epochDate, dt),
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(vx, vy, vz),
    });
  }

  return enrichSampleVelocities(samples);
}

/** CZML-compatible cubic Hermite basis (matches degree-3 HERMITE with cartesianVelocity). */
function hermiteBasis(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    2 * t3 - 3 * t2 + 1,
    t3 - 2 * t2 + t,
    -2 * t3 + 3 * t2,
    t3 - t2,
  ];
}

export function evaluateHermite(samples: TrajectorySample[], time: Date): THREE.Vector3 | null {
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0].position.clone();

  const tMs = time.getTime();
  if (tMs <= samples[0].time.getTime()) return samples[0].position.clone();
  if (tMs >= samples[samples.length - 1].time.getTime()) {
    return samples[samples.length - 1].position.clone();
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    const t0 = s0.time.getTime();
    const t1 = s1.time.getTime();
    if (tMs >= t0 && tMs <= t1) {
      const dtSec = (t1 - t0) / 1000;
      const alpha = dtSec <= 0 ? 0 : (tMs - t0) / (t1 - t0);
      const [h00, h10, h01, h11] = hermiteBasis(alpha);
      const p0 = s0.position;
      const p1 = s1.position;
      const m0 = s0.velocity.clone().multiplyScalar(dtSec);
      const m1 = s1.velocity.clone().multiplyScalar(dtSec);
      return new THREE.Vector3(
        h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
        h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
        h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z,
      );
    }
  }

  return samples[samples.length - 1].position.clone();
}

export function samplePolyline(samples: TrajectorySample[], steps = POLYLINE_STEPS): THREE.Vector3[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) return [samples[0].position.clone()];

  const start = samples[0].time;
  const stop = samples[samples.length - 1].time;
  const totalSeconds = secondsBetween(start, stop);
  if (totalSeconds <= 0) return samples.map((s) => s.position.clone());

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = addSeconds(start, (totalSeconds * i) / steps);
    const pos = evaluateHermite(samples, t);
    if (pos) points.push(pos);
  }
  return points.length >= 2 ? points : samples.map((s) => s.position.clone());
}

export function getPositionAtSamples(samples: TrajectorySample[], time: Date): THREE.Vector3 | null {
  return evaluateHermite(samples, time);
}

function hermiteBasisDerivatives(t: number): [number, number, number, number] {
  const t2 = t * t;
  return [
    6 * t2 - 6 * t,
    3 * t2 - 4 * t + 1,
    -6 * t2 + 6 * t,
    3 * t2 - 2 * t,
  ];
}

/** Velocity (m/s) along the same Hermite spline as evaluateHermite. */
export function evaluateHermiteVelocity(samples: TrajectorySample[], time: Date): THREE.Vector3 | null {
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0].velocity.clone();

  const tMs = time.getTime();
  if (tMs <= samples[0].time.getTime()) return samples[0].velocity.clone();
  if (tMs >= samples[samples.length - 1].time.getTime()) {
    return samples[samples.length - 1].velocity.clone();
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    const t0 = s0.time.getTime();
    const t1 = s1.time.getTime();
    if (tMs >= t0 && tMs <= t1) {
      const dtSec = (t1 - t0) / 1000;
      if (dtSec <= 0) return s0.velocity.clone();
      const alpha = (tMs - t0) / (t1 - t0);
      const [dh00, dh10, dh01, dh11] = hermiteBasisDerivatives(alpha);
      const p0 = s0.position;
      const p1 = s1.position;
      const m0 = s0.velocity.clone().multiplyScalar(dtSec);
      const m1 = s1.velocity.clone().multiplyScalar(dtSec);
      const dPosDalpha = new THREE.Vector3(
        dh00 * p0.x + dh10 * m0.x + dh01 * p1.x + dh11 * m1.x,
        dh00 * p0.y + dh10 * m0.y + dh01 * p1.y + dh11 * m1.y,
        dh00 * p0.z + dh10 * m0.z + dh01 * p1.z + dh11 * m1.z,
      );
      return dPosDalpha.divideScalar(dtSec);
    }
  }

  return samples[samples.length - 1].velocity.clone();
}

export interface CraftState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

export function getCraftState(
  trajectory: ParsedTrajectory | null,
  time: Date,
): CraftState | null {
  if (!trajectory) return null;
  const position = getPositionAtSamples(trajectory.samples, time);
  const velocity = evaluateHermiteVelocity(trajectory.samples, time);
  if (!position || !velocity) return null;
  return { position, velocity };
}

function parseCzmlDocument(data: CzmlPacket[], kind: TrajectoryKind): ParsedTrajectory | null {
  const packet = data.find(
    (p) =>
      p.id &&
      p.id !== "document" &&
      p.position?.epoch &&
      (p.position.cartesian || p.position.cartesianVelocity),
  );
  if (!packet?.position?.epoch) return null;

  const pos = packet.position;
  const epoch = pos.epoch;
  const values = pos.cartesianVelocity ?? pos.cartesian;
  if (!epoch || !values) return null;

  const stride = pos.cartesianVelocity ? 7 : 4;
  const samples = parseCartesianSamples(epoch, values, stride);
  if (samples.length === 0) return null;

  const polyline = samplePolyline(samples);
  const start = samples[0].time;
  const stop = samples[samples.length - 1].time;

  return {
    kind,
    epoch: parseIso(packet.position.epoch),
    samples,
    polyline,
    timeRange: { start, stop },
  };
}

export async function fetchTrajectory(
  relativeUrl: string,
  kind: TrajectoryKind,
): Promise<ParsedTrajectory | null> {
  const url = czmlUrl(relativeUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load CZML: ${res.statusText}`);
  const data = (await res.json()) as CzmlPacket[];
  return parseCzmlDocument(data, kind);
}

export function mergeTimeRanges(trajectories: ParsedTrajectory[]): { start: Date; stop: Date } | null {
  if (trajectories.length === 0) return null;

  let start = trajectories[0].timeRange.start;
  let stop = trajectories[0].timeRange.stop;

  for (const traj of trajectories) {
    if (traj.timeRange.start.getTime() < start.getTime()) start = traj.timeRange.start;
    if (traj.timeRange.stop.getTime() > stop.getTime()) stop = traj.timeRange.stop;
  }

  return { start, stop };
}

export function collectTrajectoryPoints(
  trajectories: Record<TrajectoryKind, ParsedTrajectory | null>,
  visibility: Record<TrajectoryKind, boolean>,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const kind of Object.keys(trajectories) as TrajectoryKind[]) {
    if (!visibility[kind]) continue;
    const traj = trajectories[kind];
    if (!traj) continue;
    for (const p of traj.polyline) points.push(p.clone());
  }
  return points;
}

export function getCraftPosition(
  trajectory: ParsedTrajectory | null,
  time: Date,
): THREE.Vector3 | null {
  if (!trajectory) return null;
  return getPositionAtSamples(trajectory.samples, time);
}
