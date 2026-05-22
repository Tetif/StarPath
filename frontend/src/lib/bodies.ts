import type { BodyId } from "../types";

export interface MoonDefinition {
  id: string;
  name: string;
  /** Real radius in meters. */
  radiusM: number;
  color: string;
  parentId: BodyId;
  /** Mean orbital distance from parent (meters). */
  orbitRadiusM: number;
  /** Sidereal orbital period (days). */
  orbitPeriodDays: number;
  orbitPhase: number;
  /** Moon is selectable for missions (only Earth's Moon). */
  clickable?: boolean;
}

/** Major moons rendered as child bodies around their parent planet. */
export const MOONS: MoonDefinition[] = [
  {
    id: "moon",
    name: "Moon",
    radiusM: 1_737_400,
    color: "#C0C0C0",
    parentId: "earth",
    orbitRadiusM: 384_400_000,
    orbitPeriodDays: 27.32,
    orbitPhase: 0.4,
    clickable: true,
  },
  {
    id: "phobos",
    name: "Phobos",
    radiusM: 11_266,
    color: "#8B7355",
    parentId: "mars",
    orbitRadiusM: 9_376_000,
    orbitPeriodDays: 0.3189,
    orbitPhase: 0.0,
  },
  {
    id: "deimos",
    name: "Deimos",
    radiusM: 6_200,
    color: "#A09080",
    parentId: "mars",
    orbitRadiusM: 23_463_000,
    orbitPeriodDays: 1.262,
    orbitPhase: 2.1,
  },
  {
    id: "io",
    name: "Io",
    radiusM: 1_821_600,
    color: "#E8D44D",
    parentId: "jupiter",
    orbitRadiusM: 421_700_000,
    orbitPeriodDays: 1.77,
    orbitPhase: 0.2,
  },
  {
    id: "europa",
    name: "Europa",
    radiusM: 1_560_800,
    color: "#F5F5DC",
    parentId: "jupiter",
    orbitRadiusM: 671_100_000,
    orbitPeriodDays: 3.55,
    orbitPhase: 1.1,
  },
  {
    id: "ganymede",
    name: "Ganymede",
    radiusM: 2_634_100,
    color: "#B8B8A8",
    parentId: "jupiter",
    orbitRadiusM: 1_070_400_000,
    orbitPeriodDays: 7.15,
    orbitPhase: 2.3,
  },
  {
    id: "callisto",
    name: "Callisto",
    radiusM: 2_410_300,
    color: "#8B8B7A",
    parentId: "jupiter",
    orbitRadiusM: 1_882_700_000,
    orbitPeriodDays: 16.69,
    orbitPhase: 3.6,
  },
  {
    id: "titan",
    name: "Titan",
    radiusM: 2_574_700,
    color: "#E8A84A",
    parentId: "saturn",
    orbitRadiusM: 1_221_870_000,
    orbitPeriodDays: 15.95,
    orbitPhase: 1.8,
  },
  {
    id: "triton",
    name: "Triton",
    radiusM: 1_353_400,
    color: "#D4E4F0",
    parentId: "neptune",
    orbitRadiusM: 354_760_000,
    orbitPeriodDays: 5.88,
    orbitPhase: 4.1,
  },
];

export function getMoonById(id: string): MoonDefinition | undefined {
  return MOONS.find((m) => m.id === id);
}
