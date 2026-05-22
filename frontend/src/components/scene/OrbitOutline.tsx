import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Line2 } from "three-stdlib";

import {
  buildOrbitMotionGradientColors,
  type OrbitGradientOptions,
} from "../../lib/orbitGradient";
import {
  clipPolylineOutsideSphereWithColors,
  type OrbitVertexColor,
} from "../../lib/orbitClip";

interface OrbitOutlineProps {
  points: THREE.Vector3[];
  color?: string;
  opacity?: number;
  lineWidth?: number;
  /** Hide segments that pass through a sphere at the origin (e.g. the Sun). */
  occludeOriginRadius?: number;
  /** When set, dark→color trail locked to the ring vertices (no polyline resampling). */
  motionGradient?: {
    getAnchorPhase: () => number;
    getForwardSign?: () => number;
    options?: OrbitGradientOptions;
  };
}

interface OrbitSegmentProps {
  points: THREE.Vector3[];
  vertexColors?: OrbitVertexColor[];
  color: string;
  opacity: number;
  lineWidth: number;
  sourcePoints?: THREE.Vector3[];
  segmentIndex?: number;
  occludeOriginRadius?: number;
  closed?: boolean;
  motionGradient?: OrbitOutlineProps["motionGradient"];
  gradientOptions: OrbitGradientOptions;
}

function colorWithOpacity(color: string, opacity: number): THREE.Color {
  const rgb = new THREE.Color(color);
  rgb.r *= opacity;
  rgb.g *= opacity;
  rgb.b *= opacity;
  return rgb;
}

/** Drop a duplicated closing vertex; closed rings use the `closed` clip flag instead. */
function trimDuplicateClosure(points: THREE.Vector3[], closed: boolean): THREE.Vector3[] {
  if (!closed || points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const avgRadius =
    points.reduce((sum, p) => sum + p.length(), 0) / Math.max(points.length, 1);
  const eps = Math.max(avgRadius * 1e-8, 1e-6);
  if (first.distanceToSquared(last) <= eps * eps) {
    return points.slice(0, -1).map((p) => p.clone());
  }
  return points.map((p) => p.clone());
}

function dedupeConsecutive(points: THREE.Vector3[], minDist: number): THREE.Vector3[] {
  if (points.length === 0) return [];
  const result = [points[0].clone()];
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceTo(result[result.length - 1]) >= minDist) {
      result.push(points[i].clone());
    }
  }
  return result;
}

function preparePolyline(points: THREE.Vector3[]): THREE.Vector3[] | null {
  if (points.length < 2) return null;

  const avgRadius =
    points.reduce((sum, p) => sum + p.length(), 0) / Math.max(points.length, 1);
  const minDist = Math.max(avgRadius * 1e-5, 1e-3);
  const deduped = dedupeConsecutive(points, minDist);
  if (deduped.length < 2) return null;

  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  const gap = first.distanceTo(last);
  if (gap < avgRadius * 0.15 && gap > minDist) {
    deduped.push(first.clone());
  }

  return deduped;
}

function vertexColorsToThree(colors: OrbitVertexColor[]): THREE.Color[] {
  return colors.map((c) => new THREE.Color(c.r, c.g, c.b));
}

function resolveSegmentVertexColors(
  sourcePoints: THREE.Vector3[],
  segmentIndex: number,
  occludeOriginRadius: number | undefined,
  closed: boolean,
  motionGradient: NonNullable<OrbitOutlineProps["motionGradient"]>,
  color: string,
  gradientOptions: OrbitGradientOptions,
): OrbitVertexColor[] | undefined {
  const colors = buildOrbitMotionGradientColors(
    sourcePoints,
    motionGradient.getAnchorPhase(),
    color,
    {
      ...gradientOptions,
      forwardSign: motionGradient.getForwardSign?.() ?? gradientOptions.forwardSign,
    },
  );

  if (!occludeOriginRadius || occludeOriginRadius <= 0) {
    return colors;
  }

  const clipped = clipPolylineOutsideSphereWithColors(
    sourcePoints,
    colors,
    occludeOriginRadius,
    closed,
  );
  return clipped[segmentIndex]?.colors;
}

function OrbitLineSegment({
  points,
  vertexColors,
  color,
  opacity,
  lineWidth,
  sourcePoints,
  segmentIndex = 0,
  occludeOriginRadius,
  closed = false,
  motionGradient,
  gradientOptions,
}: OrbitSegmentProps) {
  const lineRef = useRef<Line2>(null);
  const displayColor = useMemo(() => colorWithOpacity(color, opacity), [color, opacity]);
  const lineVertexColors = useMemo(
    () => (vertexColors ? vertexColorsToThree(vertexColors) : undefined),
    [vertexColors],
  );

  useFrame(() => {
    if (!motionGradient || !sourcePoints || !lineRef.current) return;
    const geom = lineRef.current.geometry;
    if (!geom || typeof (geom as { setColors?: unknown }).setColors !== "function") return;

    const segmentColors = resolveSegmentVertexColors(
      sourcePoints,
      segmentIndex,
      occludeOriginRadius,
      closed,
      motionGradient,
      color,
      gradientOptions,
    );
    if (!segmentColors) return;

    const flat = segmentColors.flatMap((c) => [c.r, c.g, c.b]);
    (geom as THREE.BufferGeometry & { setColors: (arr: number[]) => void }).setColors(flat);
    const colorStart = geom.getAttribute("instanceColorStart");
    const colorEnd = geom.getAttribute("instanceColorEnd");
    if (colorStart) colorStart.needsUpdate = true;
    if (colorEnd) colorEnd.needsUpdate = true;
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color={vertexColors ? "#ffffff" : displayColor}
      vertexColors={lineVertexColors}
      lineWidth={lineWidth}
      fog={false}
      depthWrite={false}
      renderOrder={0}
      toneMapped={false}
    />
  );
}

export default function OrbitOutline({
  points,
  color = "#FFFFFF",
  opacity = 0.4,
  lineWidth = 2.5,
  occludeOriginRadius,
  motionGradient,
}: OrbitOutlineProps) {
  const closed = motionGradient?.options?.closed ?? false;

  const sourcePoints = useMemo(() => {
    if (points.length < 2) return null;
    return trimDuplicateClosure(
      points.map((p) => p.clone()),
      motionGradient ? closed : true,
    );
  }, [points, motionGradient, closed]);

  const linePoints = useMemo(() => {
    if (!sourcePoints) return null;
    if (motionGradient) return sourcePoints;
    return preparePolyline(sourcePoints);
  }, [sourcePoints, motionGradient]);

  const gradientOptions = useMemo<OrbitGradientOptions>(
    () => ({ opacity, ...motionGradient?.options }),
    [opacity, motionGradient?.options],
  );

  const segments = useMemo(() => {
    if (!linePoints) return [];

    if (!motionGradient) {
      if (!occludeOriginRadius || occludeOriginRadius <= 0) {
        return [{ points: linePoints, colors: undefined as OrbitVertexColor[] | undefined }];
      }
      return clipPolylineOutsideSphereWithColors(linePoints, null, occludeOriginRadius, closed).map(
        (s) => ({ points: s.points, colors: undefined }),
      );
    }

    const colors = buildOrbitMotionGradientColors(
      linePoints,
      motionGradient.getAnchorPhase(),
      color,
      {
        ...gradientOptions,
        forwardSign: motionGradient.getForwardSign?.() ?? gradientOptions.forwardSign,
      },
    );

    if (!occludeOriginRadius || occludeOriginRadius <= 0) {
      return [{ points: linePoints, colors }];
    }

    return clipPolylineOutsideSphereWithColors(
      linePoints,
      colors,
      occludeOriginRadius,
      closed,
    ).map((s) => ({ points: s.points, colors: s.colors }));
  }, [linePoints, occludeOriginRadius, closed, motionGradient, color, gradientOptions]);

  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((segment, index) => (
        <OrbitLineSegment
          key={index}
          points={segment.points}
          vertexColors={segment.colors}
          color={color}
          opacity={opacity}
          lineWidth={lineWidth}
          sourcePoints={motionGradient ? linePoints ?? undefined : undefined}
          segmentIndex={index}
          occludeOriginRadius={occludeOriginRadius}
          closed={closed}
          motionGradient={motionGradient}
          gradientOptions={gradientOptions}
        />
      ))}
    </>
  );
}
