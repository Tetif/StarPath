import type { BodyId } from "../types";

export interface PlanetVisualConfig {
  textureUrl: string;
  fallbackColor: string;
  /** Radians per Julian day (approximate). */
  orbitSpeed: number;
  /** Initial orbital phase in radians. */
  orbitPhase: number;
  /** Spin rate in radians per Julian day. */
  spinSpeed?: number;
  /** Initial spin angle in radians. */
  spinPhase?: number;
  /** Obliquity in radians (tilt of spin axis). */
  axialTilt?: number;
  /** Direction of the tilt axis in the ecliptic plane, radians. */
  poleLongitude?: number;
  hasRings?: boolean;
  emissive?: boolean;
}

export interface MoonVisualConfig {
  textureUrl: string;
  fallbackColor: string;
  /** Tint when reusing a shared moon texture. */
  tint?: string;
}

const LOCAL = (file: string) => `/textures/${file}`;
const TAU = Math.PI * 2;
const DAY = TAU;
const deg = (value: number) => (value * Math.PI) / 180;

export const SKY_TEXTURE_URL = LOCAL("stars.jpg");

export const PLANET_VISUALS: Record<string, PlanetVisualConfig> = {
  sun: {
    textureUrl: LOCAL("sun.jpg"),
    fallbackColor: "#FDB813",
    orbitSpeed: 0,
    orbitPhase: 0,
    spinSpeed: DAY / 25,
    spinPhase: 0,
    emissive: true,
  },
  mercury: {
    textureUrl: LOCAL("mercury.jpg"),
    fallbackColor: "#B5B5B5",
    orbitSpeed: 0.12,
    orbitPhase: 0.2,
    spinSpeed: DAY / 58.6,
    spinPhase: 0.4,
    axialTilt: deg(0.03),
    poleLongitude: 0.15,
  },
  venus: {
    textureUrl: LOCAL("venus.jpg"),
    fallbackColor: "#E6C87A",
    orbitSpeed: 0.08,
    orbitPhase: 1.1,
    spinSpeed: -DAY / 243,
    spinPhase: 1.8,
    axialTilt: deg(177.4),
    poleLongitude: 0.9,
  },
  earth: {
    textureUrl: LOCAL("earth.jpg"),
    fallbackColor: "#2E86AB",
    orbitSpeed: 0.05,
    orbitPhase: 2.4,
    spinSpeed: DAY,
    spinPhase: 0,
    axialTilt: deg(23.44),
    poleLongitude: 0,
  },
  mars: {
    textureUrl: LOCAL("mars.jpg"),
    fallbackColor: "#CD5C5C",
    orbitSpeed: 0.04,
    orbitPhase: 3.8,
    spinSpeed: DAY / 1.026,
    spinPhase: 2.1,
    axialTilt: deg(25.19),
    poleLongitude: 0.35,
  },
  jupiter: {
    textureUrl: LOCAL("jupiter.jpg"),
    fallbackColor: "#C88B3A",
    orbitSpeed: 0.015,
    orbitPhase: 0.7,
    spinSpeed: DAY / 0.414,
    spinPhase: 0.5,
    axialTilt: deg(3.13),
    poleLongitude: 0.2,
  },
  saturn: {
    textureUrl: LOCAL("saturn.jpg"),
    fallbackColor: "#F4D59E",
    orbitSpeed: 0.01,
    orbitPhase: 4.2,
    spinSpeed: DAY / 0.444,
    spinPhase: 1.2,
    axialTilt: deg(26.73),
    poleLongitude: 0.55,
    hasRings: true,
  },
  uranus: {
    textureUrl: LOCAL("uranus.jpg"),
    fallbackColor: "#73C2FB",
    orbitSpeed: 0.007,
    orbitPhase: 5.1,
    spinSpeed: -DAY / 0.718,
    spinPhase: 2.6,
    axialTilt: deg(97.77),
    poleLongitude: 0.8,
  },
  neptune: {
    textureUrl: LOCAL("neptune.jpg"),
    fallbackColor: "#3F54BA",
    orbitSpeed: 0.005,
    orbitPhase: 1.9,
    spinSpeed: DAY / 0.671,
    spinPhase: 0.7,
    axialTilt: deg(28.32),
    poleLongitude: 0.45,
  },
  moon: {
    textureUrl: LOCAL("moon.jpg"),
    fallbackColor: "#C0C0C0",
    orbitSpeed: 0,
    orbitPhase: 0,
  },
};

export const MOON_VISUALS: Record<string, MoonVisualConfig> = {
  moon: { textureUrl: LOCAL("moon.jpg"), fallbackColor: "#C0C0C0" },
  phobos: { textureUrl: LOCAL("phobos.jpg"), fallbackColor: "#8B7355" },
  deimos: { textureUrl: LOCAL("deimos.jpg"), fallbackColor: "#A09080" },
  io: { textureUrl: LOCAL("io.jpg"), fallbackColor: "#E8D44D" },
  europa: { textureUrl: LOCAL("europa.jpg"), fallbackColor: "#F5F5DC" },
  ganymede: { textureUrl: LOCAL("ganymede.jpg"), fallbackColor: "#B8B8A8" },
  callisto: { textureUrl: LOCAL("callisto.jpg"), fallbackColor: "#8B8B7A" },
  titan: { textureUrl: LOCAL("titan.jpg"), fallbackColor: "#E8A84A" },
  triton: { textureUrl: LOCAL("triton.jpg"), fallbackColor: "#D4E4F0" },
};

export function getPlanetVisual(bodyId: string): PlanetVisualConfig | undefined {
  return PLANET_VISUALS[bodyId];
}

export function getMoonVisual(moonId: string): MoonVisualConfig | undefined {
  return MOON_VISUALS[moonId];
}

export const NAVIGABLE_BODIES: BodyId[] = [
  "earth",
  "mars",
  "mercury",
  "venus",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "moon",
];
