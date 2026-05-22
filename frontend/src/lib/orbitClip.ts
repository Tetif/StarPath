import * as THREE from "three";

export interface OrbitVertexColor {
  r: number;
  g: number;
  b: number;
}

export interface OrbitPolylineSegment {
  points: THREE.Vector3[];
  colors?: OrbitVertexColor[];
}

function pushIntersection(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3[],
): void {
  if (t < 0 || t > 1) return;
  out.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t));
}

function lerpVertexColor(
  a: OrbitVertexColor,
  b: OrbitVertexColor,
  t: number,
): OrbitVertexColor {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Intersections of segment ab with a sphere centered at the origin (0–2 points, ascending t). */
export function segmentSphereIntersections(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  if (radius <= 0) return out;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const aDotD = a.x * dx + a.y * dy + a.z * dz;
  const aLen2 = a.lengthSq();
  const dLen2 = dx * dx + dy * dy + dz * dz;
  if (dLen2 < 1e-24) return out;

  const c = aLen2 - radius * radius;
  const disc = aDotD * aDotD - dLen2 * c;
  if (disc < 0) return out;

  const sqrtDisc = Math.sqrt(disc);
  pushIntersection(a, b, (-aDotD - sqrtDisc) / dLen2, out);
  if (disc > 0) {
    pushIntersection(a, b, (-aDotD + sqrtDisc) / dLen2, out);
  }
  return out;
}

function segmentSphereIntersectionTs(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
): number[] {
  const ts: number[] = [];
  if (radius <= 0) return ts;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const aDotD = a.x * dx + a.y * dy + a.z * dz;
  const aLen2 = a.lengthSq();
  const dLen2 = dx * dx + dy * dy + dz * dz;
  if (dLen2 < 1e-24) return ts;

  const c = aLen2 - radius * radius;
  const disc = aDotD * aDotD - dLen2 * c;
  if (disc < 0) return ts;

  const sqrtDisc = Math.sqrt(disc);
  const t0 = (-aDotD - sqrtDisc) / dLen2;
  if (t0 >= 0 && t0 <= 1) ts.push(t0);
  if (disc > 0) {
    const t1 = (-aDotD + sqrtDisc) / dLen2;
    if (t1 >= 0 && t1 <= 1) ts.push(t1);
  }
  return ts;
}

/**
 * Split a polyline into contiguous pieces lying outside a sphere at the origin.
 * Used to hide orbit segments that pass through the Sun.
 */
export function clipPolylineOutsideSphere(
  points: THREE.Vector3[],
  radius: number,
  closed: boolean,
): THREE.Vector3[][] {
  return clipPolylineOutsideSphereWithColors(points, null, radius, closed).map((s) => s.points);
}

/**
 * Like `clipPolylineOutsideSphere`, but keeps per-vertex colors aligned with points.
 */
export function clipPolylineOutsideSphereWithColors(
  points: THREE.Vector3[],
  colors: OrbitVertexColor[] | null,
  radius: number,
  closed: boolean,
): OrbitPolylineSegment[] {
  if (points.length < 2 || radius <= 0) {
    if (points.length < 2) return [];
    return [{ points, colors: colors ?? undefined }];
  }

  if (colors && colors.length !== points.length) {
    colors = null;
  }

  const edgeCount = closed ? points.length : points.length - 1;
  const segments: OrbitPolylineSegment[] = [];
  let currentPoints: THREE.Vector3[] = [];
  let currentColors: OrbitVertexColor[] = [];

  const flush = () => {
    if (currentPoints.length >= 2) {
      segments.push({
        points: currentPoints,
        colors: colors ? currentColors : undefined,
      });
    }
    currentPoints = [];
    currentColors = [];
  };

  const pushPoint = (point: THREE.Vector3, color?: OrbitVertexColor) => {
    currentPoints.push(point);
    if (colors && color) currentColors.push(color);
  };

  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const colorA = colors?.[i];
    const colorB = colors?.[(i + 1) % points.length];
    const aInside = a.lengthSq() <= radius * radius;
    const bInside = b.lengthSq() <= radius * radius;

    if (aInside && bInside) {
      flush();
      continue;
    }

    const hits = segmentSphereIntersections(a, b, radius);
    const hitTs = segmentSphereIntersectionTs(a, b, radius);

    if (!aInside && !bInside) {
      if (hits.length === 0) {
        if (currentPoints.length === 0) {
          pushPoint(a.clone(), colorA);
        }
        pushPoint(b.clone(), colorB);
        continue;
      }

      if (hits.length === 1) {
        const t = hitTs[0] ?? 0;
        if (currentPoints.length === 0) pushPoint(a.clone(), colorA);
        pushPoint(
          hits[0],
          colorA && colorB ? lerpVertexColor(colorA, colorB, t) : colorB,
        );
        flush();
        continue;
      }

      const t0 = hitTs[0] ?? 0;
      const t1 = hitTs[1] ?? 1;
      if (currentPoints.length === 0) pushPoint(a.clone(), colorA);
      pushPoint(hits[0], colorA && colorB ? lerpVertexColor(colorA, colorB, t0) : colorB);
      flush();
      pushPoint(
        hits[1].clone(),
        colorA && colorB ? lerpVertexColor(colorA, colorB, t1) : colorB,
      );
      pushPoint(b.clone(), colorB);
      continue;
    }

    if (aInside && !bInside) {
      if (hits.length > 0) {
        const t = hitTs[hitTs.length - 1] ?? 1;
        currentPoints = [
          hits[hits.length - 1].clone(),
        ];
        currentColors = colorA && colorB
          ? [lerpVertexColor(colorA, colorB, t)]
          : [];
        pushPoint(b.clone(), colorB);
      }
      continue;
    }

    // exiting sphere: a outside, b inside
    if (currentPoints.length === 0) pushPoint(a.clone(), colorA);
    if (hits.length > 0) {
      const t = hitTs[0] ?? 1;
      pushPoint(
        hits[0],
        colorA && colorB ? lerpVertexColor(colorA, colorB, t) : colorB,
      );
    }
    flush();
  }

  flush();
  return segments;
}
