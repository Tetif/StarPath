import { useMemo } from "react";

import * as THREE from "three";



import type { BodyId } from "../types";

import { getMoonById, type MoonDefinition } from "../lib/bodies";

import {
  buildSampledTrack,
  closeOrbitLoop,
  getEphemerisPositionAtTime,
  getPositionAtTime,
  type EphemerisData,
  type SampledTrack,
} from "../lib/ephemeris";

import { getMoonOrbitRadius, getPlanetPosition } from "../lib/scaleMode";

import { daysSinceJ2000 } from "../lib/time";



export function usePlanetPosition(

  bodyId: BodyId,

  time: Date,

  ephemeris: EphemerisData | null,

): THREE.Vector3 {

  return useMemo(

    () => resolvePlanetPosition(bodyId, time, ephemeris),

    [bodyId, time, ephemeris],

  );

}



export function resolvePlanetPosition(

  bodyId: BodyId,

  time: Date,

  ephemeris: EphemerisData | null,

): THREE.Vector3 {

  if (bodyId === "moon") {

    const moon = getMoonById("moon");

    if (moon) return resolveMoonPosition(moon, time, ephemeris);

  }



  const track = buildSampledTrack(bodyId, ephemeris);

  if (track) {

    return getPositionAtTime(track, time) ?? new THREE.Vector3();

  }

  return getPlanetPosition(bodyId, time);

}



/** Offset from parent planet (meters), in heliocentric axes. */
export function resolveMoonLocalOffset(
  moon: MoonDefinition,
  time: Date,
  ephemeris: EphemerisData | null,
): THREE.Vector3 {
  if (moon.id === "moon") {
    const moonTrack = buildSampledTrack("moon", ephemeris);
    const earthTrack = buildSampledTrack("earth", ephemeris);
    if (moonTrack && earthTrack) {
      const moonPos = getPositionAtTime(moonTrack, time);
      const earthPos = getPositionAtTime(earthTrack, time);
      if (moonPos && earthPos) {
        return moonPos.clone().sub(earthPos);
      }
    }
  }

  const days = daysSinceJ2000(time);
  const angle = moon.orbitPhase + (days / moon.orbitPeriodDays) * Math.PI * 2;
  const orbitRadius = getMoonOrbitRadius(moon);

  return new THREE.Vector3(
    Math.cos(angle) * orbitRadius,
    Math.sin(angle) * orbitRadius * 0.06,
    Math.sin(angle) * orbitRadius * 0.3,
  );
}

export function resolveMoonPosition(
  moon: MoonDefinition,
  time: Date,
  ephemeris: EphemerisData | null,
): THREE.Vector3 {
  const parentPos = resolvePlanetPosition(moon.parentId, time, ephemeris);
  return parentPos.clone().add(resolveMoonLocalOffset(moon, time, ephemeris));
}



export function resolveBodyPosition(

  bodyId: string,

  time: Date,

  ephemeris: EphemerisData | null,

): THREE.Vector3 {

  if (bodyId === "sun") return new THREE.Vector3();



  const moon = getMoonById(bodyId);

  if (moon) return resolveMoonPosition(moon, time, ephemeris);



  return resolvePlanetPosition(bodyId as BodyId, time, ephemeris);

}



export function getPlanetTrack(

  bodyId: BodyId,

  ephemeris: EphemerisData | null,

): SampledTrack | null {

  return buildSampledTrack(bodyId, ephemeris);

}



/** Planet-centric moon orbit; refTime anchors the ring to the simulation clock. */
export function buildMoonOrbitPathLocal(
  moon: MoonDefinition,
  ephemeris: EphemerisData | null,
  refTime: Date,
  segments = 128,
): THREE.Vector3[] {
  let periodDays = moon.orbitPeriodDays;
  if (moon.id === "moon") {
    const track = buildSampledTrack("moon", ephemeris);
    if (track && track.times.length >= 2) {
      const spanDays =
        (track.times[track.times.length - 1].getTime() - track.times[0].getTime()) / 86400000;
      periodDays = Math.min(moon.orbitPeriodDays, Math.max(spanDays, 1));
    }
  }

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const dayOffset = (i / segments) * periodDays;
    const t = new Date(refTime.getTime() + dayOffset * 86400000);
    points.push(resolveMoonLocalOffset(moon, t, ephemeris));
  }

  return closeOrbitLoop(points);
}

export { getEphemerisPositionAtTime, getPositionAtTime };


