import * as THREE from "three";

import type { MoonDefinition } from "./bodies";

import { getMoonById } from "./bodies";

import { getPlanetVisual } from "./planetAssets";

import { daysSinceJ2000 } from "./time";



/** Minimum angular size (radians) when scaling bodies by camera distance. */

const REAL_MIN_ANGULAR = 8e-7;

const MAX_RADIUS_BOOST = 22;



const AU_METERS = 1.496e11;



/** Mean orbital radius in AU (fallback layout before ephemeris loads). */

const ORBIT_AU: Record<string, number> = {

  mercury: 0.39,

  venus: 0.72,

  earth: 1.0,

  mars: 1.52,

  jupiter: 5.2,

  saturn: 9.5,

  uranus: 19.2,

  neptune: 30.1,

};



/** Sidereal orbital period in days (orbit ring sampling). */

export const PLANET_ORBIT_PERIOD_DAYS: Record<string, number> = {

  mercury: 87.97,

  venus: 224.7,

  earth: 365.25,

  mars: 686.98,

  jupiter: 4332.59,

  saturn: 10759.22,

  uranus: 30688.5,

  neptune: 60182,

};



export function visualSunRadius(): number {

  return 696340000;

}



export function visualPlanetRadius(realRadiusM: number): number {

  return realRadiusM;

}



export function visualMoonRadius(realRadiusM: number): number {

  return realRadiusM;

}



/** Grow body radius when the camera is far away so planets stay visible. */

export function getDistanceScaledBodyRadius(

  baseRadius: number,

  cameraDistance: number,

): number {

  const boosted = cameraDistance * REAL_MIN_ANGULAR;

  const maxRadius = baseRadius * MAX_RADIUS_BOOST;

  return Math.max(baseRadius, Math.min(boosted, maxRadius));

}



/** Inflate sun disc when viewed from far away so the surface map stays visible. */

const SUN_MIN_ANGULAR = 3.5e-6;

const SUN_MAX_BOOST = 18;



export function getSunDisplayRadius(cameraDistance: number): number {

  const physical = visualSunRadius();

  const minVisible = cameraDistance * SUN_MIN_ANGULAR;

  const maxRadius = physical * SUN_MAX_BOOST;

  return Math.min(Math.max(physical, minVisible), maxRadius);

}



export function getPlanetPosition(bodyId: string, time: Date): THREE.Vector3 {

  const au = ORBIT_AU[bodyId];

  if (au == null) return new THREE.Vector3();



  const radius = au * AU_METERS;

  const index = PLANETS.findIndex((p) => p.id === bodyId);

  const visual = getPlanetVisual(bodyId);

  const orbitSpeed = visual?.orbitSpeed ?? 0.02 * (index + 1);

  const orbitPhase = visual?.orbitPhase ?? (index + 1) * 1.15;

  const days = daysSinceJ2000(time);

  const angle = orbitPhase + days * orbitSpeed;

  const incl = (index + 1) * 0.04;



  return new THREE.Vector3(

    Math.cos(angle) * radius,

    Math.sin(angle) * radius * Math.cos(incl),

    Math.sin(angle) * radius * Math.sin(incl) * 0.25,

  );

}



/** Mean Earth–Moon distance (m); floor for the Moon's analytical orbit. */
export const EARTH_MOON_ORBIT_M = 384_400_000;

/** Keep moon paths outside the parent planet's distance-scaled disc. */
export const MOON_ORBIT_MIN_CLEARANCE = 1.12;

/**
 * Visual minimum orbit as multiples of parent radius (close-in moons, e.g. Mars).
 * Real Phobos is ~2.8× Mars radius and reads as clipping the planet mesh.
 */
const MOON_ORBIT_MIN_PARENT_RADIUS_FACTOR: Record<string, number> = {
  phobos: 4.25,
  deimos: 7.5,
};

export function getMoonOrbitRadius(moon: MoonDefinition): number {
  let radius = moon.orbitRadiusM;
  if (moon.id === "moon") {
    return Math.max(radius, EARTH_MOON_ORBIT_M);
  }
  const parent = PLANETS.find((p) => p.id === moon.parentId);
  const minFactor = MOON_ORBIT_MIN_PARENT_RADIUS_FACTOR[moon.id];
  if (parent && minFactor != null) {
    radius = Math.max(radius, parent.radius * minFactor);
  }
  return radius;
}

/** Radially push a planet-local moon offset outside the parent's display sphere. */
export function applyMoonOrbitDisplayFloor(
  localOffset: THREE.Vector3,
  parentDisplayRadiusM: number,
): THREE.Vector3 {
  const minRadius = parentDisplayRadiusM * MOON_ORBIT_MIN_CLEARANCE;
  const dist = localOffset.length();
  if (dist < 1e-3) {
    return new THREE.Vector3(minRadius, 0, 0);
  }
  if (dist >= minRadius) {
    return localOffset;
  }
  return localOffset.clone().multiplyScalar(minRadius / dist);
}

/** Uniform scale for moon orbit rings when the parent planet is distance-boosted. */
export function getMoonOrbitDisplayScale(
  moon: MoonDefinition,
  parentDisplayRadiusM: number,
): number {
  const nominal = getMoonOrbitRadius(moon);
  const minRadius = parentDisplayRadiusM * MOON_ORBIT_MIN_CLEARANCE;
  if (nominal < 1e-3) return 1;
  return Math.max(1, minRadius / nominal);
}



export const PLANETS = [

  { id: "mercury", name: "Mercury", radius: 2439700, color: "#B5B5B5" },

  { id: "venus", name: "Venus", radius: 6051800, color: "#E6C87A" },

  { id: "earth", name: "Earth", radius: 6371000, color: "#2E86AB" },

  { id: "mars", name: "Mars", radius: 3389500, color: "#CD5C5C" },

  { id: "jupiter", name: "Jupiter", radius: 69911000, color: "#C88B3A" },

  { id: "saturn", name: "Saturn", radius: 58232000, color: "#F4D59E" },

  { id: "uranus", name: "Uranus", radius: 25362000, color: "#73C2FB" },

  { id: "neptune", name: "Neptune", radius: 24622000, color: "#3F54BA" },

] as const;



export const TRAJECTORY_COLORS: Record<string, string> = {

  fastest: "#FF5555",

  cheapest: "#5599FF",

  balanced: "#44DD77",

};



export const TRAJECTORY_GLOW: Record<string, string> = {

  fastest: "rgba(255, 85, 85, 0.35)",

  cheapest: "rgba(85, 153, 255, 0.35)",

  balanced: "rgba(68, 204, 119, 0.35)",

};



/** Camera stand-off when chasing the craft during flight playback. */
export const CRAFT_CHASE_DISTANCE_M = 8e7;

/** Vertical lift factor for chase camera (fraction of chase distance). */
export const CRAFT_CHASE_HEIGHT_FACTOR = 0.35;

/** Physical Starship height (m); used for craft display scaling. */
export const STARSHIP_HEIGHT_M = 50;

/** Minimum on-screen craft diameter (px) when viewed from far away. */
export const CRAFT_MIN_SCREEN_DIAMETER_PX = 40;

/** On-screen diameter (px) at chase camera stand-off (CRAFT_CHASE_DISTANCE_M). */
export const CRAFT_CHASE_SCREEN_DIAMETER_PX = 164;

/** Screen-space render order: trajectory lines draw underneath the craft. */
export const CRAFT_RENDER_ORDER = 50;

export const TRAJECTORY_LINE_RENDER_ORDER = 0;

/**
 * Display radius (m) for the craft mesh.
 * Far: at least CRAFT_MIN_SCREEN_DIAMETER_PX; near chase distance: CRAFT_CHASE_SCREEN_DIAMETER_PX;
 * closer than chase: grows proportionally to zoom.
 */
export function getCraftDisplayRadius(
  cameraDistance: number,
  viewportHeight: number,
  fovDeg: number,
): number {
  const camDist = Math.max(cameraDistance, 1);
  const fovRad = (fovDeg * Math.PI) / 180;
  const angularPerPixel = (2 * Math.tan(fovRad / 2)) / Math.max(viewportHeight, 1);

  const farAngularRadius = (CRAFT_MIN_SCREEN_DIAMETER_PX / 2) * angularPerPixel;
  const chaseAngularRadius = (CRAFT_CHASE_SCREEN_DIAMETER_PX / 2) * angularPerPixel;

  const minRadius = camDist * farAngularRadius;
  const chaseRadius =
    ((CRAFT_CHASE_DISTANCE_M * CRAFT_CHASE_DISTANCE_M) / camDist) * chaseAngularRadius;

  return Math.max(minRadius, chaseRadius);
}

export function getCameraDistanceLimits(): { min: number; max: number } {

  return { min: 1e4, max: 8e12 };

}



/** Fog distances tuned for real-scale scene (Three.js linear fog). */

export function getFogSettings(): { near: number; far: number; enabled: boolean } {

  return { near: 5e10, far: 4e12, enabled: true };

}



/** Default camera distance for full solar-system overview. */

export function getSolarSystemOverviewDistance(): number {

  return 8e11;

}



export function getBodyVisualRadius(bodyId: string): number {

  if (bodyId === "sun") return visualSunRadius();

  const moon = getMoonById(bodyId);

  if (moon) return visualMoonRadius(moon.radiusM);

  const planet = PLANETS.find((p) => p.id === bodyId);

  if (planet) return visualPlanetRadius(planet.radius);

  return 1e6;

}



/** Camera stand-off when focusing a body. */

export function getBodyFocusStandoff(bodyId: string): { minStandoff: number; preferredView: number } {

  const radius = getBodyVisualRadius(bodyId);

  const limits = getCameraDistanceLimits();



  if (bodyId === "sun") {

    const overview = getSolarSystemOverviewDistance();

    return { minStandoff: overview, preferredView: overview };

  }



  const moon = getMoonById(bodyId);

  if (moon) {

    return {

      minStandoff: Math.max(radius * 18, limits.min * 6),

      preferredView: Math.max(radius * 40, limits.min * 10),

    };

  }



  return {

    minStandoff: Math.max(radius * 28, limits.min * 10),

    preferredView: Math.max(radius * 80, limits.min * 16),

  };

}



/** @deprecated use getBodyFocusStandoff */

export function getBodyFocusDistance(bodyId: string): number {

  return getBodyFocusStandoff(bodyId).preferredView;

}


