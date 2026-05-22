import * as THREE from "three";

import type { OrbitVertexColor } from "./orbitClip";

export interface OrbitGradientOptions {
  /** Global ring opacity baked into vertex RGB (opaque draw, no overlap brightening). */
  opacity?: number;
  closed?: boolean;
  /** +1 when the planet moves toward higher ring indices, −1 otherwise. */
  forwardSign?: number;
  /** Fraction of the ring (0–1) used for the fade-in toward the planet. */
  trailFraction?: number;
  /** Brightness at the far end of the trail (0–1, relative to the orbit color). */
  trailMinFactor?: number;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Steps along the trail arc (opposite to instantaneous motion on the ring). */
function trailingOffset(
  vertexIndex: number,
  anchorPhase: number,
  count: number,
  closed: boolean,
  forwardSign: number,
): number {
  if (count <= 1) return -1;

  const aheadAlongIndex = ((vertexIndex - anchorPhase) % count + count) % count;
  const behindAlongIndex = ((anchorPhase - vertexIndex) % count + count) % count;

  if (!closed) {
    const trail = forwardSign > 0 ? behindAlongIndex : aheadAlongIndex;
    return trail > 0 ? trail : -1;
  }

  if (aheadAlongIndex < 1e-5 && behindAlongIndex < 1e-5) return 0;

  const aheadAlongMotion = forwardSign > 0 ? aheadAlongIndex : behindAlongIndex;
  const trailAlongMotion = forwardSign > 0 ? behindAlongIndex : aheadAlongIndex;

  if (trailAlongMotion < 1e-5) return 0;
  return trailAlongMotion <= aheadAlongMotion ? trailAlongMotion : -1;
}

/**
 * Per-vertex colors for an orbit line: brightest at the planet, darker
 * along the trail opposite to motion. `anchorPhase` may be fractional.
 */
export function buildOrbitMotionGradientColors(
  points: THREE.Vector3[],
  anchorPhase: number,
  color: string,
  options: OrbitGradientOptions = {},
): OrbitVertexColor[] {
  const count = points.length;
  if (count === 0) return [];

  const opacity = options.opacity ?? 1;
  const closed = options.closed ?? true;
  const forwardSign = options.forwardSign ?? 1;
  const trailFraction = options.trailFraction ?? 0.42;
  const trailMinFactor = options.trailMinFactor ?? 0.28;

  const base = new THREE.Color(color);
  const anchor = closed ? ((anchorPhase % count) + count) % count : anchorPhase;
  const trailLen = Math.max(2, Math.round(count * trailFraction));

  const colors: OrbitVertexColor[] = [];
  for (let i = 0; i < count; i++) {
    const behind = trailingOffset(i, anchor, count, closed, forwardSign);
    let factor = 1;

    if (behind >= 0) {
      if (behind <= trailLen) {
        const t = behind / trailLen;
        factor = trailMinFactor + (1 - trailMinFactor) * smoothstep(t);
      } else {
        factor = 1;
      }
    }

    colors.push({
      r: base.r * factor * opacity,
      g: base.g * factor * opacity,
      b: base.b * factor * opacity,
    });
  }

  return colors;
}
